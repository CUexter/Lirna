import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { createResearchAssistant } from "./research-assistant";
import {
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

test("renders a validated ledger when final synthesis is structurally invalid", async () => {
  let call = 0;
  const persisted: Array<{ content: string; references: unknown[] }> = [];
  const receipts = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
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
      if (call < 6)
        return textStream("Unrelated prose.\n\n:::quote[ev_1]\n:::");
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

  expect(call).toBe(3);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.content).toMatch(
    /^Verified prose claim\n\n:::quote\[[0-9a-f-]{36}\]\n:::$/,
  );
  expect(persisted[0]?.references).not.toEqual([
    expect.objectContaining({ evidenceAlias: "ev_1" }),
  ]);
  expect(chunks).toContainEqual({
    type: "message-metadata",
    messageMetadata: {
      references: [
        expect.objectContaining({
          evidenceAlias: "ev_1",
          occurrences: [expect.objectContaining({ presentation: "quote" })],
        }),
      ],
    },
  });
  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "ground",
    output: {
      kind: "source-passage-reference",
      outcome: "admitted",
      candidateCount: 1,
    },
  });
  expect(
    chunks.some(
      (chunk) =>
        chunk.type === "text-delta" && chunk.delta.includes("Unrelated prose."),
    ),
  ).toBe(false);
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "validated-answer",
    delta: "Verified prose claim\n\n:::quote[ev_1]\n:::",
  });
  expect(receipts).toMatchObject([{ outcome: "successful" }]);
});

test("does not spend the remaining model budget repairing answer formatting", async () => {
  const persisted: unknown[] = [];
  const receipts = [];
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
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

  expect(call).toBe(3);
  expect(persisted).toEqual(["persisted"]);
  expect(chunks.some(({ type }) => type === "error")).toBe(false);
  expect(receipts).toMatchObject([{ outcome: "successful" }]);
});
