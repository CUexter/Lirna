import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import { persistAssistantAnswer } from "./assistant-stream-persistence";
import type { ResearchPassageReference } from "./research-thread-contract";

test("persists only the final answer from a multi-step assistant stream", async () => {
  let persisted: string | undefined;

  await persistAssistantAnswer(multiStepAssistantStream(), async (content) => {
    persisted = content;
  });

  expect(persisted).toBe("## Grounded connection");
});

test("compiles verified evidence aliases before persistence", async () => {
  let persisted:
    | { content: string; references: ResearchPassageReference[] }
    | undefined;

  await persistAssistantAnswer(
    evidenceStream(),
    async (content, references) => {
      persisted = { content, references };
    },
  );

  expect(persisted?.content).toMatch(
    /^The passage grounds this claim\.\[\^[\da-f-]{36}\]$/,
  );
  expect(persisted?.references).toMatchObject([
    {
      id: "10000000-0000-4000-8000-000000000000",
      componentIdentity: "article",
      occurrences: [
        {
          id: expect.any(String),
          presentation: "passing",
          relation: "supports",
          referenceId: "10000000-0000-4000-8000-000000000000",
        },
      ],
      selection: { exactText: "Verified passage." },
    },
  ]);
});

function multiStepAssistantStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      controller.enqueue({ type: "start-step" });
      controller.enqueue({ type: "text-start", id: "planning-text" });
      controller.enqueue({
        type: "text-delta",
        id: "planning-text",
        delta: "Let me inspect the supplement.",
      });
      controller.enqueue({ type: "text-end", id: "planning-text" });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "start-step" });
      controller.enqueue({ type: "text-start", id: "answer-text" });
      controller.enqueue({
        type: "text-delta",
        id: "answer-text",
        delta: "## Grounded connection",
      });
      controller.enqueue({ type: "text-end", id: "answer-text" });
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
      controller.enqueue({ type: "start-step" });
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "reference-call",
        output: {
          kind: "source-passage-reference",
          id: "10000000-0000-4000-8000-000000000000",
          evidenceAlias: "ev_1",
          componentIdentity: "article",
          componentLabel: "Article",
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
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "start-step" });
      controller.enqueue({ type: "text-start", id: "answer-text" });
      controller.enqueue({
        type: "text-delta",
        id: "answer-text",
        delta: "The passage grounds this claim.[^ev_1]",
      });
      controller.enqueue({ type: "text-end", id: "answer-text" });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
