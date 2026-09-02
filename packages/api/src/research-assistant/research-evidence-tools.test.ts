import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createResearchAssistant } from "./research-assistant";

test("reports repeated passage text as ambiguous without an occurrence", async () => {
  let call = 0;
  const observations: Record<string, unknown>[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("reference", "referencePassage", {
          componentIdentity: "article",
          exactText: "Repeated evidence.",
        });
      return textStream("The passage is ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Repeated evidence. Between. Repeated evidence."),
    {
      onEvidenceResolution(observation) {
        observations.push(observation);
      },
    },
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "reference",
    output: {
      kind: "evidence-resolution",
      outcome: "ambiguous",
      reasonCode: "multiple-matching-passages",
      componentScope: ["article"],
      candidateCount: 2,
    },
  });
  expect(observations).toEqual([
    {
      operation: "referencePassage",
      outcome: "ambiguous",
      reasonCode: "multiple-matching-passages",
      componentScope: ["article"],
      candidateCount: 2,
      durationMs: expect.any(Number),
    },
  ]);
  expect(JSON.stringify(observations)).not.toContain("Repeated evidence");
  expect(JSON.stringify(observations)).not.toContain("Research question");
});

test("reports missing and out-of-scope passages as expected outcomes", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("missing", "referencePassage", {
          componentIdentity: "article",
          exactText: "Absent evidence.",
        });
      if (call === 2)
        return toolCallStream("refused", "referencePassage", {
          componentIdentity: "outside-scope",
          exactText: "Verified passage.",
        });
      return textStream("The requested evidence is unavailable.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Verified passage."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "missing",
    output: {
      kind: "evidence-resolution",
      outcome: "none",
      reasonCode: "no-matching-passage",
      componentScope: ["article"],
      candidateCount: 0,
    },
  });
  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "refused",
    output: {
      kind: "evidence-resolution",
      outcome: "refused",
      reasonCode: "scope-denied",
      componentScope: ["outside-scope"],
    },
  });
});

test("reports an exhausted passage admission budget", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallsStream(
          Array.from({ length: 13 }, (_, index) => ({
            id: `reference-${index + 1}`,
            toolName: "referencePassage",
            input: {
              componentIdentity: "article",
              exactText: "Verified passage.",
            },
          })),
        );
      return textStream("The evidence budget was exhausted.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Verified passage."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "reference-13",
    output: {
      kind: "evidence-resolution",
      outcome: "budget-exhausted",
      reasonCode: "admission-budget-exhausted",
      componentScope: ["article"],
    },
  });
});

function request(plainText: string) {
  return {
    componentLabel: "Article",
    components: [
      {
        identity: "article",
        label: "Article",
        plainText,
        role: "main" as const,
      },
    ],
    question: "Research question",
    sourceText: plainText,
    sourceTitle: "Test source",
  };
}

function toolCallStream(id: string, toolName: string, input: object) {
  return toolCallsStream([{ id, toolName, input }]);
}

function toolCallsStream(
  calls: Array<{ id: string; toolName: string; input: object }>,
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        ...calls.map(({ id, toolName, input }) => ({
          type: "tool-call" as const,
          toolCallId: id,
          toolName,
          input: JSON.stringify(input),
        })),
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
