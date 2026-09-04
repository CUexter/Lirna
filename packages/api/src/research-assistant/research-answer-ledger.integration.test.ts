import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { createNativeResearchAssistant } from "./research-assistant";
import { createResearchEvidenceSession } from "./research-evidence-tools";
import {
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("gives an invalid answer ledger one bounded repair before synthesis", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) => {
      call += 1;
      if (toolChoice?.type === "none") return textStream("Uncertain answer.");
      return toolCallStream(`prepare-${call}`, "prepareAnswer", {
        claims: [
          {
            key: "claim",
            text: "Uncertain answer.",
            kind: call === 1 ? "source-dependent" : "original-reasoning",
            evidence: [],
          },
        ],
      });
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model, undefined, {
    evidenceBudget: {
      maximumDiscoveries: 1,
      maximumCandidatesPerDiscovery: 2,
      maximumAdmissions: 1,
      maximumModelSteps: 3,
      maximumTotalEvidenceCharacters: 1_000,
    },
  }).answer({
    componentIdentity: "article",
    componentLabel: "Article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Main evidence.",
        role: "main",
      },
    ],
    question: "What can be concluded?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Main evidence.",
    sourceTitle: "Test source",
  });
  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls.map(({ toolChoice }) => toolChoice)).toEqual([
    { type: "tool", toolName: "prepareAnswer" },
    { type: "tool", toolName: "prepareAnswer" },
    { type: "none" },
  ]);
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "text-1",
    delta: "Uncertain answer.",
  });
});

test("returns one uncertainty response when ledger repair is exhausted", async () => {
  const persisted: unknown[] = [];
  const receipts = [];
  const model = new MockLanguageModelV4({
    doStream: async () =>
      toolCallStream(crypto.randomUUID(), "prepareAnswer", {
        claims: [
          {
            key: "claim",
            text: "Unsupported claim.",
            kind: "source-dependent",
            evidence: [],
          },
        ],
      }),
  });
  const answer = await createNativeResearchAssistant(model, undefined, {
    evidenceBudget: {
      maximumDiscoveries: 1,
      maximumCandidatesPerDiscovery: 2,
      maximumAdmissions: 1,
      maximumModelSteps: 3,
      maximumTotalEvidenceCharacters: 1_000,
    },
  }).answer(
    {
      componentIdentity: "article",
      componentLabel: "Article",
      components: [
        {
          identity: "article",
          label: "Article",
          plainText: "Main evidence.",
          role: "main",
        },
      ],
      question: "What can be concluded?",
      sourceId: "source-one",
      sourceStateId: "state-one",
      derivativeId: "derivative-one",
      sourceText: "Main evidence.",
      sourceTitle: "Test source",
    },
    {
      commit: {
        researchThreadId: "30000000-0000-4000-8000-000000000000",
        persist: async (...result) => {
          persisted.push(result);
        },
      },
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    },
  );

  const chunks: UIMessageChunk[] = [];
  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "invalid-answer",
    delta:
      "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.",
  });
  expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  expect(chunks.some(({ type }) => type === "error")).toBe(false);
  expect(persisted).toEqual([]);
  expect(receipts).toMatchObject([{ outcome: "invalid-answer" }]);
});

test("revalidates canonical evidence before persistence and expires the session", async () => {
  let evidenceSession:
    | ReturnType<typeof createResearchEvidenceSession>
    | undefined;
  const appended: Array<
    Parameters<ResearchThreadOperations["commitAnswer"]>[0]
  > = [];
  const turns = createResearchTurnOperations(
    {
      async answer(_input, options) {
        const session = createResearchEvidenceSession({
          components: [
            {
              identity: "active:/",
              label: "Main entry",
              plainText: "Different passage.",
              role: "main",
            },
          ],
          sourceStateId: "state-one",
          derivativeId: "derivative-one",
        });
        evidenceSession = session;
        return session.run(async () => canonicalEvidenceStream(), {
          commit: options?.commit,
          onError: options?.onError,
          onReceipt: options?.onEvidenceSessionReceipt,
        });
      },
    },
    {
      async commitAnswer(input) {
        appended.push(input);
        return undefined;
      },
    },
  );

  const chunks: UIMessageChunk[] = [];
  const stream = await turns.answer({
    questionMessageId: "40000000-0000-4000-8000-000000000000",
    threadId: "30000000-0000-4000-8000-000000000000",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    question: "What is grounded?",
    sourceTitle: "Test entry",
    sourceText: "Verified passage.",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: "Verified passage.",
        role: "main",
      },
    ],
  });
  for await (const chunk of stream) chunks.push(chunk);

  expect(appended).toEqual([]);
  expect(await evidenceSession?.validateReferences([])).toBe(false);
  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText:
      "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.",
  });
});

function canonicalEvidenceStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "admit",
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
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "prepare",
        output: {
          kind: "answer-ledger",
          outcome: "valid",
          ledger: {
            claims: [
              {
                key: "claim",
                text: "Grounded claim.",
                kind: "source-dependent",
                evidence: [{ alias: "ev_1", relation: "supports" }],
              },
            ],
          },
        },
      });
      controller.enqueue({
        type: "text-delta",
        id: "text",
        delta: "Grounded claim.[^ev_1]",
      });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
