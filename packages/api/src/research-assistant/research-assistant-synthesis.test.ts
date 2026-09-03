import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { createResearchAssistant } from "./research-assistant";
import {
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";

test("reserves the final agent step for a text answer", async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) => {
      if (toolChoice?.type === "none")
        return textStream("Final grounded answer.");
      if (
        toolChoice?.type === "tool" &&
        toolChoice.toolName === "prepareAnswer"
      )
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "reasoning",
              text: "Final grounded answer.",
              kind: "original-reasoning",
              evidence: [],
            },
          ],
        });
      return toolCallStream("read", "readSourceComponent", {
        componentIdentity: "article",
        offset: 0,
      });
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer({
    componentLabel: "Article",
    componentIdentity: "article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Main article.",
        role: "main",
      },
    ],
    question: "Keep researching before answering.",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Main article.",
    sourceTitle: "Test source",
  });

  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls).toHaveLength(7);
  expect(model.doStreamCalls[6]?.toolChoice).toEqual({ type: "none" });
  expect(model.doStreamCalls[6]?.prompt[0]).toMatchObject({
    role: "system",
    content: expect.stringContaining("empty :::quote[ev_1] then ::: block"),
  });
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "text-1",
    delta: "Final grounded answer.",
  });
});

test("uses the configured final model step to synthesize without more tools", async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) => {
      if (toolChoice?.type === "none")
        return textStream("Budget-bounded answer with remaining uncertainty.");
      if (
        toolChoice?.type === "tool" &&
        toolChoice.toolName === "prepareAnswer"
      )
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "uncertainty",
              text: "Budget-bounded answer with remaining uncertainty.",
              kind: "original-reasoning",
              evidence: [],
            },
          ],
        });
      return toolCallStream("read", "readSourceComponent", {
        componentIdentity: "article",
        offset: 0,
      });
    },
  });
  const answer = await createResearchAssistant(model, undefined, {
    evidenceBudget: {
      maximumDiscoveries: 2,
      maximumCandidatesPerDiscovery: 2,
      maximumAdmissions: 2,
      maximumModelSteps: 3,
      maximumTotalEvidenceCharacters: 1_000,
    },
  }).answer({
    componentLabel: "Article",
    componentIdentity: "article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Main article.",
        role: "main",
      },
    ],
    question: "Keep researching before answering.",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Main article.",
    sourceTitle: "Test source",
  });

  for await (const _chunk of answer) {
    // Consume the stream so every bounded model step runs.
  }

  expect(model.doStreamCalls).toHaveLength(2);
  expect(model.doStreamCalls[1]?.toolChoice).toEqual({ type: "none" });
});

test("forces synthesis immediately after an evidence budget is exhausted", async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) => {
      if (toolChoice?.type === "none")
        return textStream(
          "One passage was found; further evidence is uncertain.",
        );
      if (
        toolChoice?.type === "tool" &&
        toolChoice.toolName === "prepareAnswer"
      )
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "uncertainty",
              text: "One passage was found; further evidence is uncertain.",
              kind: "original-reasoning",
              evidence: [],
            },
          ],
        });
      return toolCallStream("find", "findEvidence", {
        componentScope: ["article"],
        intent: "main evidence",
        limit: 1,
      });
    },
  });
  const answer = await createResearchAssistant(model, undefined, {
    evidenceBudget: {
      maximumDiscoveries: 1,
      maximumCandidatesPerDiscovery: 1,
      maximumAdmissions: 1,
      maximumModelSteps: 8,
      maximumTotalEvidenceCharacters: 1_000,
    },
  }).answer({
    componentLabel: "Article",
    componentIdentity: "article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Main evidence.",
        role: "main",
      },
    ],
    question: "Keep finding evidence.",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Main evidence.",
    sourceTitle: "Test source",
  });

  for await (const _chunk of answer) {
    // Consume the stream so the forced synthesis step runs.
  }

  expect(model.doStreamCalls).toHaveLength(4);
  expect(model.doStreamCalls[3]?.toolChoice).toEqual({ type: "none" });
});
