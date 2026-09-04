import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";

import type {
  ResearchAnswerAttemptOperations,
  ResearchAnswerPreparationResult,
} from "./research-answer-attempt";
import { createResearchAssistant } from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("runs a Research turn through the answer-attempt seam before commit", async () => {
  const attempts: string[] = [];
  const answerAttempts: ResearchAnswerAttemptOperations<UIMessageChunk> = {
    async start(input) {
      attempts.push(input.prompt);
      const ledger = input.evidence.prepareAnswer({
        claims: [
          {
            key: "answer",
            text: "A bounded answer.",
            kind: "original-reasoning",
            evidence: [],
          },
        ],
      });
      return answerStream(ledger);
    },
    async repair() {
      throw new Error("Repair should not be needed");
    },
  };
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(
    createResearchAssistant(answerAttempts),
    {
      async append(input) {
        appended.push(input);
        return {
          id: crypto.randomUUID(),
          role: input.role,
          content: input.content,
          createdAt: "2026-09-04T12:00:00.000Z",
        };
      },
    },
  );

  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    componentLabel: "Article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Synthetic evidence.",
        role: "main",
      },
    ],
    derivativeId: "derivative-one",
    question: "What follows?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: "Synthetic evidence.",
    sourceTitle: "Test source",
  });
  for await (const _chunk of stream) {
    // Consume the stream so validation and commit complete.
  }

  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toContain("Question: What follows?");
  expect(appended).toMatchObject([
    { role: "assistant", content: "A bounded answer." },
  ]);
});

function answerStream(ledger: ResearchAnswerPreparationResult) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "prepare",
        output: ledger,
      });
      controller.enqueue({
        type: "text-delta",
        id: "answer",
        delta: "A bounded answer.",
      });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
