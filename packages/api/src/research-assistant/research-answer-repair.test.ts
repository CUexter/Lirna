import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { createResearchAssistant } from "./research-assistant";
import {
  candidateHandleFromPrompt,
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";

function request(plainText: string) {
  return {
    componentLabel: "Article",
    componentIdentity: "article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText,
        role: "main" as const,
      },
    ],
    derivativeId: "derivative-one",
    question: "Research question",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: plainText,
    sourceTitle: "Test source",
  };
}

test("repairs a final answer that fails structural validation once", async () => {
  let call = 0;
  const persisted: Array<{ content: string; references: unknown[] }> = [];
  const receipts = [];
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle: candidateHandleFromPrompt(prompt),
        });
      if (call === 3)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "claim_1",
              text: "Verified prose claim",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      if (call === 4) return textStream("Unrelated prose.");
      return textStream("Verified prose claim[^ev_1]");
    },
  });
  const answer = await createResearchAssistant(model).answer(
    request("Verified passage."),
    {
      commit: {
        researchThreadId: "30000000-0000-4000-8000-000000000000",
        persist: async (content, references) => {
          persisted.push({ content, references });
        },
      },
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    },
  );

  const chunks = [];
  for await (const chunk of answer) chunks.push(chunk);

  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.content).toMatch(
    /^Verified prose claim\[\^[0-9a-f-]{36}\]$/,
  );
  expect(receipts).toMatchObject([{ outcome: "successful" }]);
});

test("a second validation failure after repair commits no answer", async () => {
  const persisted: unknown[] = [];
  const receipts = [];
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle: candidateHandleFromPrompt(prompt),
        });
      if (call === 3)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "claim_1",
              text: "Verified prose claim",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      return textStream("Unrelated prose.");
    },
  });
  const answer = await createResearchAssistant(model).answer(
    request("Verified passage."),
    {
      commit: {
        researchThreadId: "30000000-0000-4000-8000-000000000000",
        persist: async () => {
          persisted.push("persisted");
        },
      },
      onError: (error) => `Failed: ${(error as Error).message}`,
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    },
  );

  const chunks = [];
  for await (const chunk of answer) chunks.push(chunk);

  expect(persisted).toEqual([]);
  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Failed: Research answer evidence validation failed",
  });
  expect(receipts).toMatchObject([{ outcome: "invalid-answer" }]);
});
