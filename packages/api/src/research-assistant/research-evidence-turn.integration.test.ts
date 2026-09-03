import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { createResearchAssistant } from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("persists a canonical Reference admitted through evidence discovery", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["active:/"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle: candidateHandleFromPrompt(prompt),
          purpose: "Ground the answer",
        });
      return textStream("The claim is grounded.[^ev_1]");
    },
  });
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(createResearchAssistant(model), {
    async append(input) {
      appended.push(input);
      return {
        id: crypto.randomUUID(),
        role: input.role,
        content: input.content,
        createdAt: "2026-09-03T12:00:00.000Z",
      };
    },
  });

  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: "Before.\n\nVerified passage.\n\nAfter.",
        role: "main",
      },
    ],
    derivativeId: "derivative-one",
    question: "What is verified?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: "Before.\n\nVerified passage.\n\nAfter.",
    sourceTitle: "Test source",
  });
  for await (const _chunk of stream) {
    // Consume the stream so the answer is committed.
  }

  expect(appended).toMatchObject([
    {
      role: "assistant",
      content: expect.stringMatching(
        /^The claim is grounded\.\[\^[\da-f-]{36}\]$/,
      ),
      references: [
        {
          componentIdentity: "active:/",
          selection: {
            normalizedStartOffset: 9,
            normalizedEndOffset: 26,
            exactText: "Verified passage.",
          },
          occurrences: [
            {
              presentation: "passing",
              relation: "supports",
            },
          ],
        },
      ],
    },
  ]);
});

test("persists only the deliberately selected repeated occurrence", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["active:/"],
          intent: "repeated evidence",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle: candidateHandleFromPrompt(prompt, 1),
          purpose: "Ground the later occurrence",
        });
      return textStream(
        "The later occurrence matters.[^ev_1]\n\n:::quote[ev_1]\n:::",
      );
    },
  });
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(createResearchAssistant(model), {
    async append(input) {
      appended.push(input);
      return {
        id: crypto.randomUUID(),
        role: input.role,
        content: input.content,
        createdAt: "2026-09-03T12:00:00.000Z",
      };
    },
  });

  const sourceText =
    "Repeated evidence.\n\nBetween occurrences.\n\nRepeated evidence.";
  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: sourceText,
        role: "main",
      },
    ],
    derivativeId: "derivative-one",
    question: "Which occurrence matters?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText,
    sourceTitle: "Test source",
  });
  for await (const _chunk of stream) {
    // Consume the stream so the answer is committed.
  }

  expect(appended).toHaveLength(1);
  expect(appended[0]?.references).toHaveLength(1);
  expect(appended[0]?.references?.[0]).toMatchObject({
    componentIdentity: "active:/",
    selection: {
      normalizedStartOffset: 42,
      normalizedEndOffset: 60,
      exactText: "Repeated evidence.",
    },
    occurrences: [
      { presentation: "passing", relation: "supports" },
      { presentation: "quote", relation: "supports" },
    ],
  });
});

function candidateHandleFromPrompt(prompt: unknown, index = 0) {
  const matches = JSON.stringify(prompt).match(/candidate_[0-9a-f-]+/g);
  const match = matches?.[index];
  if (!match) throw new Error("Expected an evidence candidate handle");
  return match;
}

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
