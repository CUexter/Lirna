import type { UIMessageChunk } from "ai";
import {
  AnswerValidationError,
  AssistantAnswer,
  type PersistResearchAnswer,
} from "./research-answer-finalization";
import type {
  ResearchAssistantAnswerOptions,
  ResearchAssistantEvidenceFinalizer,
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import type {
  ResearchEvidenceDecisionReceipt,
  ResearchEvidenceSessionOutcome,
  ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";
import type { ResearchThreadOperations } from "./research-thread-contract";

export interface ResearchTurnInput extends ResearchAssistantInput {
  threadId: string;
}

export interface ResearchTurnOperations {
  answer(
    input: ResearchTurnInput,
    options?: ResearchAssistantAnswerOptions,
  ): Promise<ReadableStream<UIMessageChunk>>;
}

export function createResearchTurnOperations(
  assistant: ResearchAssistantOperations,
  threads: Pick<ResearchThreadOperations, "append">,
): ResearchTurnOperations {
  return {
    async answer({ threadId, ...input }, options) {
      const startedAt = performance.now();
      let snapshot: ResearchEvidenceSessionSnapshot | undefined;
      let receiptEmitted = false;
      const emitReceipt = (outcome: ResearchEvidenceSessionOutcome) => {
        if (receiptEmitted || !snapshot) return;
        receiptEmitted = true;
        try {
          options?.onEvidenceSessionReceipt?.({
            sessionId: snapshot.sessionId,
            sourceStateId: snapshot.sourceStateId,
            resolverVersion: snapshot.resolverVersion,
            indexVersion: snapshot.indexVersion,
            budget: snapshot.budget,
            consumption: snapshot.consumption,
            candidateCount: snapshot.candidateCount,
            reasonCodes: snapshot.reasonCodes,
            admittedCount: snapshot.admittedCount,
            refusedCount: snapshot.refusedCount,
            budgetExhausted: snapshot.budgetExhausted,
            researchThreadId: threadId,
            outcome,
            ...terminalReason(outcome),
            latencyBucket: latencyBucket(performance.now() - startedAt),
          });
        } catch {
          // Diagnostics must not alter Research turn handling.
        }
      };
      let modelStream: ReadableStream<UIMessageChunk>;
      let evidenceFinalizer: ResearchAssistantEvidenceFinalizer | undefined;
      try {
        modelStream = await assistant.answer(input, {
          ...options,
          onEvidenceSessionUpdate(update) {
            snapshot = update;
            try {
              options?.onEvidenceSessionUpdate?.(update);
            } catch {
              // Diagnostics must not alter Research turn handling.
            }
          },
          onEvidenceSessionReady(session) {
            evidenceFinalizer = session;
            options?.onEvidenceSessionReady?.(session);
          },
        });
      } catch (error) {
        evidenceFinalizer?.expire();
        emitReceipt("provider-failed");
        throw error;
      }
      return researchTurnStream({
        stream: modelStream,
        persist: async (content, references) => {
          const persisted = await threads.append({
            threadId,
            role: "assistant",
            content,
            ...(references.length ? { references } : {}),
          });
          if (!persisted)
            throw new Error("Research answer could not be persisted");
        },
        onError: options?.onError,
        onTerminal: (outcome) =>
          emitReceipt(
            outcome === "successful" && snapshot
              ? completedOutcome(snapshot)
              : outcome,
          ),
        evidenceFinalizer: () => evidenceFinalizer,
      });
    },
  };
}

function terminalReason(outcome: ResearchEvidenceSessionOutcome) {
  if (outcome === "cancelled")
    return { terminalReasonCode: "client-cancelled" as const };
  if (outcome === "provider-failed")
    return { terminalReasonCode: "provider-failed" as const };
  if (outcome === "invalid-answer")
    return { terminalReasonCode: "answer-validation-failed" as const };
  if (outcome === "commit-failed")
    return { terminalReasonCode: "commit-failed" as const };
  return {};
}

function researchTurnStream({
  stream,
  persist,
  onError,
  onTerminal,
  evidenceFinalizer,
}: {
  stream: ReadableStream<UIMessageChunk>;
  persist: PersistResearchAnswer;
  onError?: (error: unknown) => string;
  onTerminal?: (outcome: ResearchEvidenceSessionOutcome) => void;
  evidenceFinalizer?: () => ResearchAssistantEvidenceFinalizer | undefined;
}) {
  const reader = stream.getReader();
  const answer = new AssistantAnswer();
  let cancelled = false;
  let finalizing = false;
  let persisting = false;
  return new ReadableStream<UIMessageChunk>({
    // fallow-ignore-next-line complexity
    async pull(controller) {
      try {
        const chunk = await nextPublicChunk(reader, answer, onTerminal);
        if (chunk) {
          if (!cancelled) controller.enqueue(chunk);
          return;
        }
        if (cancelled) return;
        if (answer.streamFailed) {
          evidenceFinalizer?.()?.expire();
          onTerminal?.("provider-failed");
          controller.close();
          return;
        }
        finalizing = true;
        const committed = await answer.commit(async (content, references) => {
          persisting = true;
          await persist(content, references);
          persisting = false;
        }, evidenceFinalizer?.());
        finalizing = false;
        evidenceFinalizer?.()?.expire();
        if (committed?.references.length)
          controller.enqueue({
            type: "message-metadata",
            messageMetadata: { references: committed.references },
          });
        if (answer.finishChunk) controller.enqueue(answer.finishChunk);
        onTerminal?.("successful");
        controller.close();
      } catch (error) {
        if (cancelled) return;
        evidenceFinalizer?.()?.expire();
        onTerminal?.(
          persisting
            ? "commit-failed"
            : finalizing && error instanceof AnswerValidationError
              ? "invalid-answer"
              : "provider-failed",
        );
        controller.enqueue({
          type: "error",
          errorText: onError?.(error) ?? "Research assistant response failed.",
        });
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
      evidenceFinalizer?.()?.expire();
      onTerminal?.("cancelled");
      await reader.cancel(reason);
    },
  });
}

async function nextPublicChunk(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  answer: AssistantAnswer,
  onTerminal?: (outcome: ResearchEvidenceSessionOutcome) => void,
) {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    answer.accept(next.value);
    if (next.value.type === "error") onTerminal?.("provider-failed");
    if (next.value.type !== "finish") return answer.publicChunk(next.value);
  }
}

function completedOutcome(
  snapshot: ResearchEvidenceSessionSnapshot,
): ResearchEvidenceSessionOutcome {
  if (snapshot.budgetExhausted) return "exhausted";
  if (snapshot.refusedCount > 0 && snapshot.admittedCount === 0)
    return "refused";
  return "successful";
}

function latencyBucket(
  durationMs: number,
): ResearchEvidenceDecisionReceipt["latencyBucket"] {
  if (durationMs < 100) return "under-100ms";
  if (durationMs < 1_000) return "100ms-1s";
  if (durationMs < 5_000) return "1s-5s";
  return "over-5s";
}
