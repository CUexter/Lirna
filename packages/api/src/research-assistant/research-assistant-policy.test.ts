import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { activeReadingStub } from "../annotations/annotation-store.test-support";
import { createResearchAssistant } from "./research-assistant";
import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";
import { createResearchTurnOperations } from "./research-turn";

test("refuses a Source policy before invoking the configured model", async () => {
  const activeReading = activeReadingStub(true);
  const readActive = activeReading.read.bind(activeReading);
  activeReading.read = async (input) => {
    const active = await readActive(input);
    return active.status === "active"
      ? {
          ...active,
          value: {
            ...active.value,
            policy: {
              rightsBasis: "owned",
              sensitivityLevel: "local-only",
            },
          },
        }
      : active;
  };
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: [] }),
    }),
  });
  let modelSelected = false;
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  let appendCalled = false;
  const turns = createResearchTurnOperations(
    createResearchAssistant(() => {
      modelSelected = true;
      return model;
    }, activeReading),
    {
      async append() {
        appendCalled = true;
        return undefined;
      },
    },
  );

  const chunks = [];
  const answer = await turns.answer(
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      componentIdentity: "article:main",
      componentLabel: "Article",
      components: [],
      question: "What does the evidence say?",
      sourceId: "source-one",
      sourceStateId: "state-one",
      sourceText: "Stale input must not be sent.",
      sourceTitle: "Test entry",
    },
    { onEvidenceSessionReceipt: (receipt) => receipts.push(receipt) },
  );
  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls).toHaveLength(0);
  expect(modelSelected).toBe(false);
  expect(appendCalled).toBe(false);
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "policy-refusal",
    delta:
      "Evidence could not be processed because the Source handling policy does not permit this research provider.",
  });
  expect(chunks.some(({ type }) => type === "error")).toBe(false);
  expect(receipts).toMatchObject([
    {
      outcome: "refused",
      reasonCodes: ["policy-denied"],
      refusedCount: 1,
    },
  ]);
});
