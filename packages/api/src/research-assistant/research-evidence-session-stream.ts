import type { UIMessageChunk } from "ai";

import {
  AnswerValidationError,
  AssistantAnswer,
} from "./research-answer-finalization";
import {
  completedOutcome,
  latencyBucket,
  maximumAnswerLedgerAttempts,
  type ResearchEvidenceSessionCompletion,
  type ResearchEvidenceSessionOutcome,
  type ResearchEvidenceSessionSnapshot,
  sessionReceipt,
  terminalReason,
} from "./research-evidence-session-contract";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

export type { ResearchEvidenceSessionCompletion };

const invalidAnswerText =
  "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.";

interface EvidenceSessionFinalizer {
  snapshot(): ResearchEvidenceSessionSnapshot;
  validateReferences(
    references: AliasedResearchPassageReference[],
  ): Promise<boolean>;
  validAnswerLedger?: () => unknown;
  answerLedgerAttempts?: () => number;
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
  let reader = stream.getReader();
  const answer = new AssistantAnswer();
  const deferFinalAnswer = session.validAnswerLedger !== undefined;
  let cancelled = false;
  let committing = false;
  let persisting = false;
  let receiptEmitted = false;
  const emitReceipt = async (outcome: ResearchEvidenceSessionOutcome) => {
    if (receiptEmitted) return;
    receiptEmitted = true;
    await options.onReceipt?.(
      sessionReceipt(session.snapshot(), commit, {
        outcome,
        ...terminalReason(outcome),
        latencyBucket: latencyBucket(performance.now() - startedAt),
      }),
    );
  };

  return new ReadableStream<UIMessageChunk>({
    // fallow-ignore-next-line complexity
    async pull(controller) {
      try {
        while (true) {
          const chunk = await nextPublicChunk(
            reader,
            answer,
            emitReceipt,
            deferFinalAnswer && Boolean(session.validAnswerLedger?.()),
          );
          if (chunk) {
            deliver(controller, chunk, cancelled);
            return;
          }
          if (cancelled) return;
          if (answer.streamFailed) {
            session.expire();
            await emitReceipt("provider-failed");
            controller.close();
            return;
          }
          if (ledgerRepairExhausted(session)) {
            session.expire();
            await emitReceipt("invalid-answer");
            deliverInvalidAnswer(controller, cancelled);
            closeQuietly(controller);
            return;
          }
          committing = true;
          let committed: Awaited<ReturnType<AssistantAnswer["commit"]>>;
          try {
            committed = await answer.commit(async (content, references) => {
              persisting = true;
              await commit.persist(content, references);
              persisting = false;
            }, session);
          } catch (error) {
            committing = false;
            if (repairable(error, session) && options.repair) {
              answer.beginRepair();
              reader = (
                await options.repair((error as AnswerValidationError).problems)
              ).getReader();
              continue;
            }
            throw error;
          }
          committing = false;
          session.expire();
          await emitReceipt(completedOutcome(session.snapshot()));
          if (committed && deferFinalAnswer)
            deliverValidatedAnswer(
              controller,
              committed.streamContent,
              cancelled,
            );
          if (committed?.streamReferences.length)
            deliver(
              controller,
              {
                type: "message-metadata",
                messageMetadata: { references: committed.streamReferences },
              },
              cancelled,
            );
          if (answer.finishChunk)
            deliver(controller, answer.finishChunk, cancelled);
          closeQuietly(controller);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        session.expire();
        const validationFailed = error instanceof AnswerValidationError;
        let errorText = validationFailed
          ? invalidAnswerText
          : (options.onError?.(error) ?? "Research assistant response failed.");
        try {
          await emitReceipt(
            persisting
              ? "commit-failed"
              : validationFailed
                ? "invalid-answer"
                : "provider-failed",
          );
        } catch (receiptError) {
          errorText =
            options.onError?.(receiptError) ??
            "Research assistant response failed.";
        }
        deliver(
          controller,
          {
            type: "error",
            errorText,
          },
          cancelled,
        );
        closeQuietly(controller);
      }
    },
    async cancel(reason) {
      if (committing) return;
      cancelled = true;
      session.expire();
      await emitReceipt("cancelled");
      await reader.cancel(reason);
    },
  });
}

function deliverValidatedAnswer(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  content: string,
  cancelled: boolean,
) {
  for (const chunk of [
    { type: "start-step" as const },
    { type: "text-start" as const, id: "validated-answer" },
    { type: "text-delta" as const, id: "validated-answer", delta: content },
    { type: "text-end" as const, id: "validated-answer" },
    { type: "finish-step" as const },
  ])
    deliver(controller, chunk, cancelled);
}

export function refuseResearchEvidenceSession(
  session: Pick<EvidenceSessionFinalizer, "snapshot" | "expire">,
  options: ResearchEvidenceSessionCompletion,
  startedAt = performance.now(),
) {
  const snapshot = session.snapshot();
  session.expire();
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      try {
        if (options.commit)
          await options.onReceipt?.(
            sessionReceipt(snapshot, options.commit, {
              outcome: "refused",
              latencyBucket: latencyBucket(performance.now() - startedAt),
            }),
          );
      } catch (error) {
        controller.enqueue({
          type: "error",
          errorText:
            options.onError?.(error) ?? "Research assistant response failed.",
        });
        controller.close();
        return;
      }
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

function repairable(
  error: unknown,
  session: EvidenceSessionFinalizer,
): error is AnswerValidationError {
  if (!(error instanceof AnswerValidationError)) return false;
  if (!session.validAnswerLedger?.()) return false;
  const { budget, consumption } = session.snapshot();
  if (consumption.modelSteps >= budget.maximumModelSteps) return false;
  return error.problems.every(({ code }) => code !== "stale-evidence");
}

function ledgerRepairExhausted(session: EvidenceSessionFinalizer) {
  return (
    !session.validAnswerLedger?.() &&
    (session.answerLedgerAttempts?.() ?? 0) >= maximumAnswerLedgerAttempts
  );
}

function deliverInvalidAnswer(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  cancelled: boolean,
) {
  for (const chunk of [
    { type: "start-step" as const },
    { type: "text-start" as const, id: "invalid-answer" },
    {
      type: "text-delta" as const,
      id: "invalid-answer",
      delta: invalidAnswerText,
    },
    { type: "text-end" as const, id: "invalid-answer" },
    { type: "finish-step" as const },
    { type: "finish" as const, finishReason: "stop" as const },
  ])
    deliver(controller, chunk, cancelled);
}

function deliver(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  chunk: UIMessageChunk,
  cancelled: boolean,
) {
  if (cancelled) return;
  try {
    controller.enqueue(chunk);
  } catch {
    // The consumer cancelled while the atomic commit finished.
  }
}

function closeQuietly(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
) {
  try {
    controller.close();
  } catch {
    // The consumer cancelled while the atomic commit finished.
  }
}

async function nextPublicChunk(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  answer: AssistantAnswer,
  onTerminal: (outcome: ResearchEvidenceSessionOutcome) => Promise<void>,
  deferFinalAnswer: boolean,
) {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    answer.accept(next.value);
    if (next.value.type === "error") await onTerminal("provider-failed");
    if (next.value.type === "finish") continue;
    const chunk = answer.publicChunk(next.value);
    if (deferFinalAnswer && finalAnswerChunk(chunk)) continue;
    return chunk;
  }
}

function finalAnswerChunk(chunk: UIMessageChunk) {
  return (
    chunk.type === "start-step" ||
    chunk.type === "text-start" ||
    chunk.type === "text-delta" ||
    chunk.type === "text-end" ||
    chunk.type === "finish-step"
  );
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
