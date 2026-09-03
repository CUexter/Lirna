import { expect, test } from "bun:test";
import { simulateReadableStream, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { createResearchAssistant } from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("gives an invalid answer ledger one bounded repair before synthesis", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) => {
      call += 1;
      if (toolChoice?.type === "none") return textStream("Uncertain answer.");
      return toolCallStream(`prepare-${call}`, {
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
  const answer = await createResearchAssistant(model, undefined, {
    evidenceBudget: {
      maximumDiscoveries: 1,
      maximumCandidatesPerDiscovery: 1,
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

test("revalidates canonical evidence before persistence and expires the session", async () => {
  let expired = false;
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(
    {
      async answer(_input, options) {
        options?.onEvidenceSessionReady?.({
          async validateReferences() {
            return false;
          },
          expire() {
            expired = true;
          },
        });
        return canonicalEvidenceStream();
      },
    },
    {
      async append(input) {
        appended.push(input);
        return undefined;
      },
    },
  );

  const chunks: UIMessageChunk[] = [];
  const stream = await turns.answer({
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
  expect(expired).toBe(true);
  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText: "Research assistant response failed.",
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

function toolCallStream(id: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        {
          type: "tool-call" as const,
          toolCallId: id,
          toolName: "prepareAnswer",
          input: JSON.stringify(input),
        },
        finishChunk("tool-calls"),
      ],
    }),
  };
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        finishChunk("stop"),
      ],
    }),
  };
}

function finishChunk(unified: "stop" | "tool-calls") {
  return {
    type: "finish" as const,
    finishReason: { unified, raw: undefined },
    logprobs: undefined,
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  };
}
