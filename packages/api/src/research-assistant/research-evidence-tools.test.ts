import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";

import type { EvidenceResolutionObservation } from "./evidence-resolution";
import { answerLedgerSchema } from "./research-answer-ledger";
import { createNativeResearchAssistant } from "./research-assistant";
import { createResearchEvidenceSession } from "./research-evidence-tools";
import {
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";

test("publishes the complete answer ledger schema to the model", () => {
  const session = createResearchEvidenceSession({
    components: [],
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
  });

  expect(session.tools.prepareAnswer.inputSchema).toBe(answerLedgerSchema);
});

test("reports repeated canonical passages as ambiguous candidates", async () => {
  let call = 0;
  const observations: EvidenceResolutionObservation[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "repeated evidence",
          desiredRelation: "supports",
          limit: 5,
        });
      return textStream("The passage is ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model).answer(
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
    toolCallId: "ground",
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
      operation: "groundEvidence",
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
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "alpha beta evidence",
          limit: 5,
        });
      return textStream("The passages are ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model).answer(
    request("Alpha evidence.\n\nBeta evidence."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "ground",
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
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "alpha beta evidence",
          limit: 2,
        });
      return textStream("The passages are ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model).answer(
    request("Alpha evidence.\n\nBeta evidence."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "ground",
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
        return toolCallStream("missing", "groundEvidence", {
          componentScope: ["article"],
          intent: "absent evidence",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("refused", "groundEvidence", {
          componentScope: ["outside-scope"],
          intent: "verified passage",
          limit: 5,
        });
      return textStream("The requested evidence is unavailable.");
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model).answer(
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

test("reports near-tied ranked passages as ambiguous candidates", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["article"],
          intent: "alpha beta gamma evidence",
          limit: 5,
        });
      return textStream("The passages are ambiguous.");
    },
  });
  const chunks = [];
  const answer = await createNativeResearchAssistant(model).answer(
    request("Alpha beta gamma evidence.\n\nBeta gamma evidence."),
  );

  for await (const chunk of answer) chunks.push(chunk);

  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "ground",
    output: expect.objectContaining({
      kind: "evidence-discovery",
      outcome: "ambiguous",
      reasonCode: "close-ranked-passages",
      candidateCount: 2,
    }),
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
