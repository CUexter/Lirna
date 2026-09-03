import type { UIMessageChunk } from "ai";
import { z } from "zod";
import { authoredTargetInputSchema } from "../authored-targets/authored-target";
import { compileResearchAnswer } from "./research-answer-markers";
import type {
  ResearchAssistantAnswerOptions,
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import type {
  ResearchEvidenceDecisionReceipt,
  ResearchEvidenceSessionOutcome,
  ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";
import type {
  AliasedResearchPassageReference,
  ResearchThreadOperations,
} from "./research-thread-contract";

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
        });
      } catch (error) {
        emitReceipt("provider-failed");
        throw error;
      }
      return researchTurnStream(
        modelStream,
        async (content, references) => {
          const persisted = await threads.append({
            threadId,
            role: "assistant",
            content,
            ...(references.length ? { references } : {}),
          });
          if (!persisted)
            throw new Error("Research answer could not be persisted");
        },
        options?.onError,
        (outcome) =>
          emitReceipt(
            outcome === "successful" && snapshot
              ? completedOutcome(snapshot)
              : outcome,
          ),
      );
    },
  };
}

function terminalReason(outcome: ResearchEvidenceSessionOutcome) {
  if (outcome === "cancelled")
    return { terminalReasonCode: "client-cancelled" as const };
  if (outcome === "provider-failed")
    return { terminalReasonCode: "provider-failed" as const };
  if (outcome === "commit-failed")
    return { terminalReasonCode: "commit-failed" as const };
  return {};
}

function researchTurnStream(
  stream: ReadableStream<UIMessageChunk>,
  persist: (
    content: string,
    references: ReturnType<typeof compileResearchAnswer>["references"],
  ) => Promise<void>,
  onError?: (error: unknown) => string,
  onTerminal?: (outcome: ResearchEvidenceSessionOutcome) => void,
) {
  const reader = stream.getReader();
  const answer = new AssistantAnswer();
  let cancelled = false;
  let committing = false;
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        const chunk = await nextPublicChunk(reader, answer, onTerminal);
        if (chunk) {
          if (!cancelled) controller.enqueue(chunk);
          return;
        }
        if (cancelled) return;
        if (answer.streamFailed) {
          onTerminal?.("provider-failed");
          controller.close();
          return;
        }
        committing = true;
        const committed = await answer.commit(persist);
        committing = false;
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
        onTerminal?.(committing ? "commit-failed" : "provider-failed");
        controller.enqueue({
          type: "error",
          errorText: onError?.(error) ?? "Research assistant response failed.",
        });
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
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

class AssistantAnswer {
  private currentStepContent = "";
  private finalStepContent = "";
  private hasStepBoundaries = false;
  private readonly references: AliasedResearchPassageReference[] = [];
  private readonly toolNames = new Map<string, string>();
  finishChunk?: Extract<UIMessageChunk, { type: "finish" }>;
  completed = false;
  completionError?: Error;
  streamFailed = false;

  accept(chunk: UIMessageChunk) {
    if (chunk.type === "tool-input-available")
      this.toolNames.set(chunk.toolCallId, chunk.toolName);
    if (chunk.type === "start-step") {
      this.hasStepBoundaries = true;
      this.currentStepContent = "";
    }
    if (chunk.type === "text-delta") this.currentStepContent += chunk.delta;
    if (chunk.type === "finish-step")
      this.finalStepContent = this.currentStepContent;
    if (chunk.type === "tool-output-available") {
      const reference = researchPassageReference(chunk.output);
      if (reference) this.references.push(reference);
    }
    if (chunk.type === "error") this.streamFailed = true;
    if (chunk.type === "abort")
      this.completionError = new Error(
        chunk.reason ?? "Research assistant response was aborted",
      );
    if (chunk.type === "finish") {
      this.finishChunk = chunk;
      if (chunk.finishReason === "stop") this.completed = true;
      else
        this.completionError = new Error(
          `Research assistant response ended with ${chunk.finishReason ?? "an unknown reason"}`,
        );
    }
  }

  publicChunk(chunk: UIMessageChunk): UIMessageChunk {
    if (
      chunk.type === "tool-input-available" &&
      researchTool(this.toolNames.get(chunk.toolCallId))
    )
      return { ...chunk, input: {} };
    if (
      chunk.type === "tool-output-available" &&
      researchTool(this.toolNames.get(chunk.toolCallId))
    )
      return { ...chunk, output: contentFreeToolOutput(chunk.output) };
    return chunk;
  }

  async commit(
    persist: Parameters<typeof researchTurnStream>[1],
  ): Promise<ReturnType<typeof compileResearchAnswer> | undefined> {
    if (this.streamFailed) return;
    if (this.completionError) throw this.completionError;
    if (!this.completed)
      throw new Error("Research assistant response ended before completion");
    const content = this.hasStepBoundaries
      ? this.finalStepContent
      : this.currentStepContent;
    if (!content.trim()) return;
    const compiled = compileResearchAnswer(content, this.references);
    await persist(compiled.content, compiled.references);
    return compiled;
  }
}

function researchTool(name: string | undefined) {
  return (
    name === "readSourceComponent" ||
    name === "findEvidence" ||
    name === "admitEvidence"
  );
}

function contentFreeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return {};
  const value = output as Record<string, unknown>;
  return {
    ...(typeof value.kind === "string" ? { kind: value.kind } : {}),
    ...(typeof value.outcome === "string" ? { outcome: value.outcome } : {}),
    ...(typeof value.reasonCode === "string"
      ? { reasonCode: value.reasonCode }
      : {}),
    ...(typeof value.candidateCount === "number"
      ? { candidateCount: value.candidateCount }
      : {}),
    ...(typeof value.found === "boolean" ? { found: value.found } : {}),
  };
}

function researchPassageReference(
  output: unknown,
): AliasedResearchPassageReference | undefined {
  if (!output || typeof output !== "object" || !("kind" in output)) return;
  if (output.kind !== "source-passage-reference") return;
  const parsed = z
    .object({
      id: z.string().uuid(),
      evidenceAlias: z.string().regex(/^ev_\d+$/),
      componentIdentity: z.string(),
      componentLabel: z.string(),
      selection: authoredTargetInputSchema,
    })
    .safeParse(output);
  return parsed.success ? parsed.data : undefined;
}
