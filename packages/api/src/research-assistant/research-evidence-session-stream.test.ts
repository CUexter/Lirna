import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";
import { completeResearchEvidenceSession } from "./research-evidence-session-stream";
import { createResearchTurnOperations } from "./research-turn";
import {
  answerStream,
  assistant,
  collect,
  evidenceSnapshot,
  input,
  type RecordedAnswer,
  recordingThreads,
  threads,
} from "./research-turn.test-support";

test("a late model failure returns an error chunk and commits no answer", async () => {
  const appended: RecordedAnswer[] = [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  let pulls = 0;
  const modelStream = new ReadableStream<UIMessageChunk>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue({
          type: "text-delta",
          id: "assistant-text",
          delta: "Partial answer",
        });
        return;
      }
      controller.error(new Error("Provider stream disconnected"));
    },
  });
  const turns = createResearchTurnOperations(
    assistant(modelStream, evidenceSnapshot()),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Provider stream disconnected",
  });
  expect(appended).toEqual([]);
  expect(receipts).toMatchObject([
    {
      outcome: "provider-failed",
      questionMessageId: input().questionMessageId,
      attemptedAnswerMessageId: expect.any(String),
    },
  ]);
});

test("a model stream that ends before its finish chunk commits no answer", async () => {
  const appended: RecordedAnswer[] = [];
  const turns = createResearchTurnOperations(
    assistant(answerStream("Truncated answer", false)),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Research assistant response ended before completion",
  });
  expect(appended).toEqual([]);
});

test("an error finish reason commits no answer", async () => {
  const appended: RecordedAnswer[] = [];
  const turns = createResearchTurnOperations(
    assistant(answerStream("Partial answer", true, "error")),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Research assistant response ended with error",
  });
  expect(appended).toEqual([]);
});

test("an error chunk from model execution commits no answer", async () => {
  const appended: RecordedAnswer[] = [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const modelStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: "Partial answer",
      });
      controller.enqueue({ type: "error", errorText: "Provider failed" });
      controller.close();
    },
  });
  const turns = createResearchTurnOperations(
    assistant(modelStream, evidenceSnapshot()),
    recordingThreads(appended),
  );

  const reader = (
    await turns.answer(input(), {
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    })
  ).getReader();
  const first = await reader.read();
  const second = await reader.read();
  const third = await reader.read();

  expect(first.value).toMatchObject({
    type: "start",
    messageId: expect.any(String),
  });
  expect(second.value).toMatchObject({ type: "text-delta" });
  expect(third.value).toEqual({
    type: "error",
    errorText: "Provider failed",
  });
  expect(appended).toEqual([]);
  expect(receipts).toMatchObject([{ outcome: "provider-failed" }]);
});

test("a failed final persistence returns an error chunk", async () => {
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const turns = createResearchTurnOperations(
    assistant(answerStream("Completed answer"), evidenceSnapshot()),
    threads(async () => undefined),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Research answer could not be persisted",
  });
  expect(receipts).toMatchObject([
    {
      outcome: "commit-failed",
      questionMessageId: input().questionMessageId,
      attemptedAnswerMessageId: expect.any(String),
    },
  ]);
});

test("stream completion waits for durable receipt storage", async () => {
  let releaseReceipt: (() => void) | undefined;
  const receiptStored = new Promise<void>((resolve) => {
    releaseReceipt = resolve;
  });
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const turns = createResearchTurnOperations(
    assistant(answerStream("Completed answer"), evidenceSnapshot()),
    recordingThreads([]),
  );
  let completed = false;

  const collecting = collect(
    await turns.answer(input(), {
      async onEvidenceSessionReceipt(receipt) {
        receipts.push(receipt);
        await receiptStored;
      },
    }),
  ).then((chunks) => {
    completed = true;
    return chunks;
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(receipts).toMatchObject([
    {
      outcome: "successful",
      questionMessageId: input().questionMessageId,
      attemptedAnswerMessageId: expect.any(String),
    },
  ]);
  expect(completed).toBe(false);

  releaseReceipt?.();
  const chunks = await collecting;
  expect(completed).toBe(true);
  expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
});

test("a receipt storage failure is returned to the stream consumer", async () => {
  const appended: RecordedAnswer[] = [];
  const turns = createResearchTurnOperations(
    assistant(answerStream("Completed answer"), evidenceSnapshot()),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
      async onEvidenceSessionReceipt() {
        throw new Error("Receipt storage unavailable");
      },
    }),
  );

  expect(appended).toHaveLength(1);
  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Receipt storage unavailable",
  });
  expect(chunks).not.toContainEqual({ type: "finish", finishReason: "stop" });
});

test("a cancellation during the atomic commit finishes the commit", async () => {
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const appended: RecordedAnswer[] = [];
  let reader: ReadableStreamDefaultReader<UIMessageChunk> | undefined;
  const turns = createResearchTurnOperations(
    assistant(answerStream("Completed answer"), evidenceSnapshot()),
    threads(async (received) => {
      appended.push(received);
      await reader?.cancel("client disconnected");
      return {
        id: crypto.randomUUID(),
        role: received.role,
        content: received.content,
        createdAt: "2026-09-02T12:00:00.000Z",
      };
    }),
  );

  reader = (
    await turns.answer(input(), {
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    })
  ).getReader();
  while (!(await reader.read()).done) {
    // Pull until the stream closes.
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(appended).toHaveLength(1);
  expect(receipts).toMatchObject([{ outcome: "successful" }]);
});

test("a cancellation during validation prevents the atomic commit", async () => {
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  let releaseValidation: (() => void) | undefined;
  let validationStarted: (() => void) | undefined;
  const validating = new Promise<void>((resolve) => {
    validationStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseValidation = resolve;
  });
  let persisted = false;
  const output = completeResearchEvidenceSession(
    answerStream("Completed answer"),
    {
      snapshot: evidenceSnapshot,
      async validateReferences() {
        validationStarted?.();
        await release;
        return true;
      },
      expire() {},
    },
    {
      commit: {
        answerMessageId: "50000000-0000-4000-8000-000000000000",
        questionMessageId: input().questionMessageId,
        researchThreadId: input().threadId,
        async persist() {
          persisted = true;
        },
      },
      onReceipt: (receipt) => receipts.push(receipt),
    },
  );
  const reader = output.getReader();
  const draining = (async () => {
    while (!(await reader.read()).done) {
      // Pull until validation begins.
    }
  })();

  await validating;
  const cancelling = reader.cancel("client disconnected");
  releaseValidation?.();
  await cancelling;
  await draining;

  expect(persisted).toBe(false);
  expect(receipts).toMatchObject([
    {
      outcome: "cancelled",
      attemptedAnswerMessageId: "50000000-0000-4000-8000-000000000000",
    },
  ]);
});
