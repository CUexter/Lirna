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
  const answer = createResearchAssistant(model).answer({
    attachments: [
      {
        data: new URL("data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl"),
        filename: "evidence.txt",
        mediaType: "text/plain",
      },
    ],
    componentLabel: "Main entry",
    question: "What does this add?",
    sourceText: "Synthetic reading text.",
    sourceTitle: "Test entry",
  });

  for await (const _chunk of answer) {
    // Consume the stream so the model call completes.
  }

  expect(model.doStreamCalls[0]?.prompt[1]).toMatchObject({
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
