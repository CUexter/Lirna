import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";
import {
  answerStream,
  assistant,
  collect,
  evidenceSnapshot,
  input,
  recordingThreads,
  threads,
} from "./research-turn.test-support";

test("a late model failure returns an error chunk and commits no answer", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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
  expect(receipts).toMatchObject([{ outcome: "provider-failed" }]);
});

test("a model stream that ends before its finish chunk commits no answer", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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

  expect(first.value).toMatchObject({ type: "text-delta" });
  expect(second.value).toEqual({
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
  expect(receipts).toMatchObject([{ outcome: "commit-failed" }]);
});

test("a cancellation during the atomic commit finishes the commit", async () => {
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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
