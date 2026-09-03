import type { UIMessageChunk } from "ai";

import {
  AnswerValidationError,
  AssistantAnswer,
  type PersistResearchAnswer,
} from "./research-answer-finalization";
import type {
  ResearchEvidenceDecisionReceipt,
  ResearchEvidenceSessionOutcome,
  ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

export interface ResearchEvidenceSessionCompletion {
  commit?: {
    researchThreadId: string;
    persist: PersistResearchAnswer;
  };
  onError?: (error: unknown) => string;
  onReceipt?: (receipt: ResearchEvidenceDecisionReceipt) => void;
}

interface EvidenceSessionFinalizer {
  snapshot(): ResearchEvidenceSessionSnapshot;
  validateReferences(
    references: AliasedResearchPassageReference[],
  ): Promise<boolean>;
  expire(): void;
}

export function completeResearchEvidenceSession(
  stream: ReadableStream<UIMessageChunk>,
  session: EvidenceSessionFinalizer,
  options: ResearchEvidenceSessionCompletion,
) {
  if (!options.commit) return expireUncommittedSession(stream, session.expire);

  const commit = options.commit;
  const startedAt = performance.now();
  const reader = stream.getReader();
  const answer = new AssistantAnswer();
  let cancelled = false;
  let finalizing = false;
  let persisting = false;
  let receiptEmitted = false;
  const emitReceipt = (outcome: ResearchEvidenceSessionOutcome) => {
    if (receiptEmitted) return;
    receiptEmitted = true;
    const snapshot = session.snapshot();
    try {
      options.onReceipt?.({
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
        researchThreadId: commit.researchThreadId,
        outcome,
        ...terminalReason(outcome),
        latencyBucket: latencyBucket(performance.now() - startedAt),
      });
    } catch {
      // Diagnostics must not alter Research Evidence Session execution.
    }
  };

  return new ReadableStream<UIMessageChunk>({
    // fallow-ignore-next-line complexity
    async pull(controller) {
      try {
        const chunk = await nextPublicChunk(reader, answer, emitReceipt);
        if (chunk) {
          if (!cancelled) controller.enqueue(chunk);
          return;
        }
        if (cancelled) return;
        if (answer.streamFailed) {
          session.expire();
          emitReceipt("provider-failed");
          controller.close();
          return;
        }
        finalizing = true;
        const committed = await answer.commit(async (content, references) => {
          persisting = true;
          await commit.persist(content, references);
          persisting = false;
        }, session);
        finalizing = false;
        session.expire();
        if (committed?.references.length)
          controller.enqueue({
            type: "message-metadata",
            messageMetadata: { references: committed.references },
          });
        if (answer.finishChunk) controller.enqueue(answer.finishChunk);
        emitReceipt(completedOutcome(session.snapshot()));
        controller.close();
      } catch (error) {
        if (cancelled) return;
        const errorText =
          options.onError?.(error) ?? "Research assistant response failed.";
        session.expire();
        emitReceipt(
          persisting
            ? "commit-failed"
            : finalizing && error instanceof AnswerValidationError
              ? "invalid-answer"
              : "provider-failed",
        );
        controller.enqueue({
          type: "error",
          errorText,
        });
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
      session.expire();
      emitReceipt("cancelled");
      await reader.cancel(reason);
    },
  });
}

export function refuseResearchEvidenceSession(
  session: Pick<EvidenceSessionFinalizer, "snapshot" | "expire">,
  options: ResearchEvidenceSessionCompletion,
) {
  const snapshot = session.snapshot();
  try {
    if (options.commit)
      options.onReceipt?.({
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
        researchThreadId: options.commit.researchThreadId,
        outcome: "refused",
        latencyBucket: "under-100ms",
      });
  } catch {
    // Diagnostics must not alter Research Evidence Session refusal.
  } finally {
    session.expire();
  }
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "start", messageId: crypto.randomUUID() });
      controller.enqueue({ type: "text-start", id: "policy-refusal" });
      controller.enqueue({
        type: "text-delta",
        id: "policy-refusal",
        delta:
          "Evidence could not be processed because the Source handling policy does not permit this research provider.",
      });
      controller.enqueue({ type: "text-end", id: "policy-refusal" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

async function nextPublicChunk(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  answer: AssistantAnswer,
  onTerminal: (outcome: ResearchEvidenceSessionOutcome) => void,
) {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    answer.accept(next.value);
    if (next.value.type === "error") onTerminal("provider-failed");
    if (next.value.type !== "finish") return answer.publicChunk(next.value);
  }
}

function expireUncommittedSession(
  stream: ReadableStream<UIMessageChunk>,
  expire: () => void,
) {
  const reader = stream.getReader();
  let expired = false;
  const expireOnce = () => {
    if (expired) return;
    expired = true;
    expire();
  };
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          expireOnce();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        expireOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      expireOnce();
      await reader.cancel(reason);
    },
  });
}

function completedOutcome(
  snapshot: ResearchEvidenceSessionSnapshot,
): ResearchEvidenceSessionOutcome {
  if (snapshot.budgetExhausted) return "exhausted";
  if (snapshot.refusedCount > 0 && snapshot.admittedCount === 0)
    return "refused";
  return "successful";
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

function latencyBucket(
  durationMs: number,
): ResearchEvidenceDecisionReceipt["latencyBucket"] {
  if (durationMs < 100) return "under-100ms";
  if (durationMs < 1_000) return "100ms-1s";
  if (durationMs < 5_000) return "1s-5s";
  return "over-5s";
}
