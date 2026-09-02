import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { ResearchAssistantOperations } from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

const threadId = "30000000-0000-4000-8000-000000000000";

test("streams Markdown and commits its compiled References together", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(
    assistant(evidenceStream()),
    recordingThreads(appended),
  );

  const chunks = await collect(await turns.answer(input()));

  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "assistant-text",
    delta: "The passage grounds this claim.[^ev_1]",
  });
  expect(appended).toMatchObject([
    {
      threadId,
      role: "assistant",
      content: expect.stringMatching(
        /^The passage grounds this claim\.\[\^[\da-f-]{36}\]$/,
      ),
      references: [
        {
          id: "10000000-0000-4000-8000-000000000000",
          componentIdentity: "active:/",
          selection: { exactText: "Verified passage." },
          occurrences: [
            {
              id: expect.any(String),
              presentation: "passing",
              relation: "supports",
            },
          ],
        },
      ],
    },
  ]);
});

test("commits only final synthesis Markdown from a multi-step turn", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(
    assistant(multiStepStream()),
    recordingThreads(appended),
  );

  await collect(await turns.answer(input()));

  expect(appended).toMatchObject([
    {
      role: "assistant",
      content: "## Grounded connection",
    },
  ]);
});

test("cancelling a turn cancels model execution and commits no answer", async () => {
  let modelCancelled = false;
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const modelStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: "Partial answer",
      });
    },
    cancel() {
      modelCancelled = true;
    },
  });
  const turns = createResearchTurnOperations(
    assistant(modelStream),
    recordingThreads(appended),
  );
  const reader = (await turns.answer(input())).getReader();

  await reader.read();
  await reader.cancel("client disconnected");

  expect(modelCancelled).toBe(true);
  expect(appended).toEqual([]);
});

test("a late model failure returns an error chunk and commits no answer", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
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
    assistant(modelStream),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Provider stream disconnected",
  });
  expect(appended).toEqual([]);
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
    assistant(modelStream),
    recordingThreads(appended),
  );

  const chunks = await collect(await turns.answer(input()));

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Provider failed",
  });
  expect(appended).toEqual([]);
});

test("a failed final persistence returns an error chunk", async () => {
  const turns = createResearchTurnOperations(
    assistant(answerStream("Completed answer")),
    threads(async () => undefined),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
    }),
  );

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Research answer could not be persisted",
  });
});

function input() {
  return {
    threadId,
    question: "What is the central claim?",
    sourceTitle: "Test entry",
    componentLabel: "Main entry",
    sourceText: "Verified passage.",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: "Verified passage.",
        role: "main" as const,
      },
    ],
  };
}

function assistant(stream: ReadableStream<UIMessageChunk>) {
  return {
    async answer() {
      return stream;
    },
  } satisfies ResearchAssistantOperations;
}

function threads(
  append: ResearchThreadOperations["append"],
): Pick<ResearchThreadOperations, "append"> {
  return { append };
}

function recordingThreads(
  appended: Array<Parameters<ResearchThreadOperations["append"]>[0]>,
) {
  return threads(async (received) => {
    appended.push(received);
    return message(received.role, received.content);
  });
}

function message(role: "user" | "assistant", content: string) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: "2026-09-02T12:00:00.000Z",
  };
}

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function answerStream(
  text: string,
  completed = true,
  finishReason: "stop" | "error" = "stop",
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      controller.enqueue({ type: "text-start", id: "assistant-text" });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: text,
      });
      controller.enqueue({ type: "text-end", id: "assistant-text" });
      if (completed) controller.enqueue({ type: "finish", finishReason });
      controller.close();
    },
  });
}

function multiStepStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start-step" });
      controller.enqueue({
        type: "text-delta",
        id: "planning-text",
        delta: "Let me inspect the supplement.",
      });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "start-step" });
      controller.enqueue({
        type: "text-delta",
        id: "answer-text",
        delta: "## Grounded connection",
      });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

function evidenceStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "reference-call",
        output: {
          kind: "source-passage-reference",
          id: "10000000-0000-4000-8000-000000000000",
          evidenceAlias: "ev_1",
          componentIdentity: "active:/",
          componentLabel: "Main entry",
          selection: {
            offsetBasis: "normalized-derivative-text-v1",
            normalizedStartOffset: 0,
            normalizedEndOffset: 17,
            exactText: "Verified passage.",
            prefix: "",
            suffix: "",
          },
        },
      });
      controller.enqueue({ type: "text-start", id: "assistant-text" });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: "The passage grounds this claim.[^ev_1]",
      });
      controller.enqueue({ type: "text-end", id: "assistant-text" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
