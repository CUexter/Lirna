import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import { persistAssistantAnswer } from "./assistant-stream-persistence";

test("persists only the final answer from a multi-step assistant stream", async () => {
  let persisted: string | undefined;

  await persistAssistantAnswer(multiStepAssistantStream(), async (content) => {
    persisted = content;
  });

  expect(persisted).toBe("## Grounded connection");
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
