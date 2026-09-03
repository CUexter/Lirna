import { expect, test } from "bun:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { createResearchAssistant } from "./research-assistant";

test("reports repeated canonical passages as ambiguous candidates", async () => {
  let call = 0;
  const observations: Record<string, unknown>[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article"],
          intent: "repeated evidence",
          desiredRelation: "supports",
          limit: 5,
        });
      return textStream("The passage is ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Repeated evidence.\n\nBetween.\n\nRepeated evidence."),
    {
      onEvidenceResolution(observation) {
        observations.push(observation);
      },
    },
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "find",
    output: {
      kind: "evidence-discovery",
      outcome: "ambiguous",
      reasonCode: "equally-ranked-passages",
      componentScope: ["article"],
      candidateCount: 2,
      candidates: expect.arrayContaining([
        expect.objectContaining({
          handle: expect.stringMatching(/^candidate_/),
          componentIdentity: "article",
          passage: "Repeated evidence.",
        }),
      ]),
    },
  });
  expect(observations).toEqual([
    {
      operation: "findEvidence",
      outcome: "ambiguous",
      reasonCode: "equally-ranked-passages",
      componentScope: ["article"],
      candidateCount: 2,
      durationMs: expect.any(Number),
    },
  ]);
  expect(JSON.stringify(observations)).not.toContain("Repeated evidence");
  expect(JSON.stringify(observations)).not.toContain("Research question");
});

test("reports distinct equally ranked passages as ambiguous candidates", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article"],
          intent: "alpha beta evidence",
          limit: 5,
        });
      return textStream("The passages are ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Alpha evidence.\n\nBeta evidence."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "find",
    output: expect.objectContaining({
      kind: "evidence-discovery",
      outcome: "ambiguous",
      reasonCode: "equally-ranked-passages",
      candidateCount: 2,
    }),
  });
});

test("detects ambiguity even when the model requests one candidate", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article"],
          intent: "alpha beta evidence",
          limit: 1,
        });
      return textStream("The passages are ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createResearchAssistant(model).answer(
    request("Alpha evidence.\n\nBeta evidence."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "find",
    output: expect.objectContaining({
      outcome: "ambiguous",
      candidateCount: 2,
      candidates: expect.arrayContaining([
        expect.objectContaining({ passage: "Alpha evidence." }),
        expect.objectContaining({ passage: "Beta evidence." }),
      ]),
    }),
  });
});

test("reports no result and out-of-scope discovery as expected outcomes", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("missing", "findEvidence", {
          componentScope: ["article"],
          intent: "absent evidence",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("refused", "findEvidence", {
          componentScope: ["outside-scope"],
          intent: "verified passage",
          limit: 5,
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
      reasonCode: "no-relevant-passage",
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
