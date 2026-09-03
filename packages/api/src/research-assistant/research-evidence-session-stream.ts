import type { UIMessageChunk } from "ai";

import { observeQuietly } from "../observation";
import {
  AnswerValidationError,
  AssistantAnswer,
} from "./research-answer-finalization";
import {
  completedOutcome,
  latencyBucket,
  type ResearchEvidenceSessionCompletion,
  type ResearchEvidenceSessionOutcome,
  type ResearchEvidenceSessionSnapshot,
  sessionReceipt,
  terminalReason,
} from "./research-evidence-session-contract";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

export type { ResearchEvidenceSessionCompletion };

interface EvidenceSessionFinalizer {
  snapshot(): ResearchEvidenceSessionSnapshot;
  validateReferences(
    references: AliasedResearchPassageReference[],
  ): Promise<boolean>;
  validAnswerLedger?: () => unknown;
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
  let cancelled = false;
  let committing = false;
  let persisting = false;
  let repairAttempted = false;
  let receiptEmitted = false;
  const emitReceipt = (outcome: ResearchEvidenceSessionOutcome) => {
    if (receiptEmitted) return;
    receiptEmitted = true;
    observeQuietly(() =>
      options.onReceipt?.(
        sessionReceipt(session.snapshot(), commit, {
          outcome,
          ...terminalReason(outcome),
          latencyBucket: latencyBucket(performance.now() - startedAt),
        }),
      ),
    );
  };

  return new ReadableStream<UIMessageChunk>({
    // fallow-ignore-next-line complexity
    async pull(controller) {
      try {
        while (true) {
          const chunk = await nextPublicChunk(reader, answer, emitReceipt);
          if (chunk) {
            deliver(controller, chunk, cancelled);
            return;
          }
          if (cancelled) return;
          if (answer.streamFailed) {
            session.expire();
            emitReceipt("provider-failed");
            controller.close();
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
            if (repairable(error, session, repairAttempted) && options.repair) {
              repairAttempted = true;
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
          if (committed?.references.length)
            deliver(
              controller,
              {
                type: "message-metadata",
                messageMetadata: { references: committed.references },
              },
              cancelled,
            );
          if (answer.finishChunk)
            deliver(controller, answer.finishChunk, cancelled);
          emitReceipt(completedOutcome(session.snapshot()));
          closeQuietly(controller);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        const errorText =
          options.onError?.(error) ?? "Research assistant response failed.";
        session.expire();
        emitReceipt(
          persisting
            ? "commit-failed"
            : error instanceof AnswerValidationError
              ? "invalid-answer"
              : "provider-failed",
        );
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
      emitReceipt("cancelled");
      await reader.cancel(reason);
    },
  });
}

export function refuseResearchEvidenceSession(
  session: Pick<EvidenceSessionFinalizer, "snapshot" | "expire">,
  options: ResearchEvidenceSessionCompletion,
  startedAt = performance.now(),
) {
  const snapshot = session.snapshot();
  observeQuietly(() => {
    if (options.commit)
      options.onReceipt?.(
        sessionReceipt(snapshot, options.commit, {
          outcome: "refused",
          latencyBucket: latencyBucket(performance.now() - startedAt),
        }),
      );
  });
  session.expire();
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

function repairable(
  error: unknown,
  session: EvidenceSessionFinalizer,
  attempted: boolean,
): error is AnswerValidationError {
  if (attempted || !(error instanceof AnswerValidationError)) return false;
  if (!session.validAnswerLedger?.()) return false;
  return error.problems.every(({ code }) => code !== "stale-evidence");
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
