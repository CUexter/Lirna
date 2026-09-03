import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { activeReadingStub } from "../annotations/annotation-store.test-support";
import { createResearchAssistant } from "./research-assistant";
import {
  candidateHandleFromPrompt,
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";

test("sends temporary evidence as an AI SDK file part", async () => {
  let selectedModel: string | undefined;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Grounded answer" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
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
          },
        ],
      }),
    }),
  });
  const answer = await createResearchAssistant((modelId) => {
    selectedModel = modelId;
    return model;
  }).answer({
    attachments: [
      {
        data: new URL("data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl"),
        filename: "evidence.txt",
        mediaType: "text/plain",
      },
    ],
    model: "z-ai/glm-5.3-flash",
    componentLabel: "Main entry",
    componentIdentity: "article",
    components: [
      {
        identity: "article",
        label: "Main entry",
        plainText: "Earlier\n\nSynthetic reading text.",
        role: "main",
      },
    ],
    history: [
      { role: "user", content: "What came first?", selectedText: "Earlier" },
      { role: "assistant", content: "An earlier grounded answer." },
    ],
    question: "What does this add?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Earlier\n\nSynthetic reading text.",
    sourceTitle: "Test entry",
  });

  for await (const _chunk of answer) {
    // Consume the stream so the model call completes.
  }

  expect(model.doStreamCalls[0]?.prompt.slice(1, 3)).toMatchObject([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "<selected-source-state-evidence>\nEarlier\n</selected-source-state-evidence>\n\nQuestion: What came first?",
        },
      ],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "An earlier grounded answer." }],
    },
  ]);
  expect(model.doStreamCalls[0]?.prompt[3]).toMatchObject({
    role: "user",
    content: [
      { type: "text" },
      {
        type: "file",
        data: { type: "data", data: "dGVtcG9yYXJ5IGV2aWRlbmNl" },
        filename: "evidence.txt",
        mediaType: "text/plain",
      },
    ],
  });
  expect(JSON.stringify(model.doStreamCalls[0]?.prompt[3])).toContain(
    '\\"identity\\":\\"article\\"',
  );
  expect(selectedModel).toBe("z-ai/glm-5.3-flash");
});

test("builds prompt evidence from the active Reading Derivative", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => textStream("Grounded answer."),
  });
  const answer = await createResearchAssistant(
    model,
    activeReadingStub(true),
  ).answer({
    componentIdentity: "article:main",
    componentLabel: "Article",
    components: [
      {
        identity: "article:main",
        label: "Article",
        plainText: "Stale reading text.",
        role: "main",
      },
    ],
    question: "What is active?",
    history: [
      {
        role: "user",
        content: "What was selected?",
        selectedText: "Stale historical selection.",
      },
    ],
    selectedText: "Stale reading text.",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: "Stale reading text.",
    sourceTitle: "Test entry",
  });

  for await (const _chunk of answer) {
    // Consume the stream so the model call completes.
  }

  const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
  expect(prompt).toContain("Readevidence carefully.");
  expect(prompt).not.toContain("Stale reading text.");
  expect(prompt).not.toContain("Stale historical selection.");
});

test("discovers and admits a canonical passage from a supplementary component", async () => {
  let call = 0;
  const supplementText = `${"x".repeat(25_000)}\n\nSupplement evidence.`;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["supplement-one"],
          intent: "supplement supporting evidence",
          desiredRelation: "supports",
          limit: 5,
        });
      if (call === 2) {
        const candidateHandle = candidateHandleFromPrompt(prompt);
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle,
          purpose: "Ground the supplement claim",
        });
      }
      if (call === 3)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "supplement-claim",
              text: "The supplement provides supporting evidence.",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      return textStream("The supplement provides supporting evidence.[^ev_1]");
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
      {
        identity: "supplement-one",
        label: "Supplement one",
        plainText: supplementText,
        role: "supplement",
      },
    ],
    question: "Does the supplement support this?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    sourceText: "Main article.",
    sourceTitle: "Test source",
  });

  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls).toHaveLength(4);
  expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
    "Supplement evidence.",
  );
  const instructions = model.doStreamCalls[0]?.prompt[0]?.content;
  expect(instructions).toContain(
    "Do not use readSourceComponent for the active component",
  );
  expect(instructions).toContain(
    "never send quotation text, offsets, occurrence numbers, prefixes, or suffixes",
  );
  expect(instructions).toContain(
    "synthesize from successfully admitted evidence and state what remains uncertain",
  );
  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "admit",
    output: {
      kind: "source-passage-reference",
      outcome: "admitted",
      candidateCount: 1,
      id: expect.any(String),
      evidenceAlias: "ev_1",
      componentIdentity: "supplement-one",
      componentLabel: "Supplement one",
      passage: "Supplement evidence.",
      selection: {
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 25_002,
        normalizedEndOffset: 25_022,
        exactText: "Supplement evidence.",
        prefix: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n\n",
        suffix: "",
      },
    },
  });
});
