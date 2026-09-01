import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createResearchAssistant } from "./research-assistant";

test("sends temporary evidence as an AI SDK file part", async () => {
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
  const answer = await createResearchAssistant(model).answer({
    attachments: [
      {
        data: new URL("data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl"),
        filename: "evidence.txt",
        mediaType: "text/plain",
      },
    ],
    componentLabel: "Main entry",
    components: [
      {
        identity: "article",
        label: "Main entry",
        plainText: "Synthetic reading text.",
        role: "main",
      },
    ],
    history: [
      { role: "user", content: "What came first?", selectedText: "Earlier" },
      { role: "assistant", content: "An earlier grounded answer." },
    ],
    question: "What does this add?",
    sourceText: "Synthetic reading text.",
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
});

test("reads a supplementary component and creates a verified passage reference", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("read", "readSourceComponent", {
          componentIdentity: "supplement-one",
          offset: 0,
        });
      if (call === 2)
        return toolCallStream("reference", "referencePassage", {
          componentIdentity: "supplement-one",
          exactText: "Supplement evidence.",
          occurrence: 1,
        });
      return textStream("The supplement provides supporting evidence.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer({
    componentLabel: "Article",
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
        plainText: "Supplement evidence.",
        role: "supplement",
      },
    ],
    question: "Does the supplement support this?",
    sourceText: "Main article.",
    sourceTitle: "Test source",
  });

  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls).toHaveLength(3);
  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "reference",
    output: {
      kind: "source-passage-reference",
      id: expect.any(String),
      evidenceAlias: "ev_1",
      componentIdentity: "supplement-one",
      componentLabel: "Supplement one",
      selection: {
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 0,
        normalizedEndOffset: 20,
        exactText: "Supplement evidence.",
        prefix: "",
        suffix: "",
      },
    },
  });
});

test("reserves the final agent step for a text answer", async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice }) =>
      toolChoice?.type === "none"
        ? textStream("Final grounded answer.")
        : toolCallStream("read", "readSourceComponent", {
            componentIdentity: "article",
            offset: 0,
          }),
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer({
    componentLabel: "Article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText: "Main article.",
        role: "main",
      },
    ],
    question: "Keep researching before answering.",
    sourceText: "Main article.",
    sourceTitle: "Test source",
  });

  for await (const chunk of answer) chunks.push(chunk);

  expect(model.doStreamCalls).toHaveLength(8);
  expect(model.doStreamCalls[7]?.toolChoice).toEqual({ type: "none" });
  expect(model.doStreamCalls[7]?.prompt[0]).toMatchObject({
    role: "system",
    content: expect.stringContaining("empty :::quote[ev_1] then ::: block"),
  });
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "text-1",
    delta: "Final grounded answer.",
  });
});

function toolCallStream(id: string, toolName: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        {
          type: "tool-call" as const,
          toolCallId: id,
          toolName,
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
