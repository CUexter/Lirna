import { expect, test } from "bun:test";

import { createEvidenceResolver } from "./evidence-resolver";

test("finds canonical evidence despite punctuation and whitespace differences in the intent", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [
      component(
        "active:/",
        "Context before.\n\nEvidence survives punctuation, and extra whitespace.\n\nContext after.",
      ),
    ],
  });

  const candidates = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["active:/"],
    intent: "evidence survives punctuation and extra   whitespace",
    limit: 5,
  });

  expect(candidates).toEqual([
    {
      handle: expect.stringMatching(/^candidate_/),
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      relevanceScore: 5,
      passage: "Evidence survives punctuation, and extra whitespace.",
      before: "Context before.",
      after: "Context after.",
    },
  ]);
});

test("keeps repeated passages bound to their canonical occurrences", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [
      component(
        "active:/",
        "Repeated evidence.\n\nBetween occurrences.\n\nRepeated evidence.",
      ),
    ],
  });

  const candidates = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["active:/"],
    intent: "repeated evidence",
    limit: 5,
  });
  const second = candidates[1];
  if (!second) throw new Error("Expected a second evidence candidate");

  expect(candidates).toHaveLength(2);
  expect(second.handle).not.toBe(candidates[0]?.handle);
  expect(
    await resolver.admit({
      sessionId: "session-one",
      sourceStateId: "state-one",
      candidateHandle: second.handle,
    }),
  ).toMatchObject({
    outcome: "admitted",
    evidenceAlias: "ev_1",
    componentIdentity: "active:/",
    passage: "Repeated evidence.",
    selection: {
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 42,
      normalizedEndOffset: 60,
      exactText: "Repeated evidence.",
      prefix: "vidence.\n\nBetween occurrences.\n\n",
      suffix: "",
    },
  });
});

test("restricts discovery to the requested Source-component scope", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [
      component("active:/", "Scoped evidence in the main entry."),
      {
        ...component("supplement:/one", "Scoped evidence in a supplement."),
        label: "Supplement",
      },
    ],
  });

  const candidates = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["supplement:/one"],
    intent: "scoped evidence",
    limit: 5,
  });

  expect(candidates.map(({ componentIdentity }) => componentIdentity)).toEqual([
    "supplement:/one",
  ]);
});

test("rejects discovery for another Source state", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [component("active:/", "Canonical evidence.")],
  });

  expect(
    await resolver.find({
      sourceStateId: "state-two",
      componentIdentities: ["active:/"],
      intent: "canonical evidence",
      limit: 5,
    }),
  ).toEqual([]);
});

test("rejects a candidate used by another session", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [component("active:/", "Canonical evidence.")],
  });
  const [candidate] = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["active:/"],
    intent: "canonical evidence",
    limit: 5,
  });
  if (!candidate) throw new Error("Expected an evidence candidate");

  expect(
    await resolver.admit({
      sessionId: "session-two",
      sourceStateId: "state-one",
      candidateHandle: candidate.handle,
    }),
  ).toEqual({
    kind: "evidence-resolution",
    outcome: "refused",
    reasonCode: "outside-session-scope",
    componentScope: [],
  });
});

test("rejects a candidate used against another Source state", async () => {
  const resolver = createEvidenceResolver({
    derivativeId: "derivative-one",
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [component("active:/", "Canonical evidence.")],
  });
  const [candidate] = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["active:/"],
    intent: "canonical evidence",
    limit: 5,
  });
  if (!candidate) throw new Error("Expected an evidence candidate");

  expect(
    await resolver.admit({
      sessionId: "session-one",
      sourceStateId: "state-two",
      candidateHandle: candidate.handle,
    }),
  ).toEqual({
    kind: "evidence-resolution",
    outcome: "refused",
    reasonCode: "outside-session-scope",
    componentScope: [],
  });
});

test("makes a candidate stale when the active Reading Derivative changes", async () => {
  let derivativeId = "derivative-one";
  const resolver = createEvidenceResolver({
    derivativeId,
    sessionId: "session-one",
    sourceStateId: "state-one",
    components: [component("active:/", "Canonical evidence.")],
    currentDerivativeId: async () => derivativeId,
  });
  const [candidate] = await resolver.find({
    sourceStateId: "state-one",
    componentIdentities: ["active:/"],
    intent: "canonical evidence",
    limit: 5,
  });
  if (!candidate) throw new Error("Expected an evidence candidate");
  derivativeId = "derivative-two";

  expect(
    await resolver.admit({
      sessionId: "session-one",
      sourceStateId: "state-one",
      candidateHandle: candidate.handle,
    }),
  ).toEqual({
    kind: "evidence-resolution",
    outcome: "stale",
    reasonCode: "derivative-changed",
    componentScope: ["active:/"],
  });
  derivativeId = "derivative-one";
  expect(
    await resolver.admit({
      sessionId: "session-one",
      sourceStateId: "state-one",
      candidateHandle: candidate.handle,
    }),
  ).toMatchObject({
    outcome: "refused",
    reasonCode: "outside-session-scope",
  });
});

function component(identity: string, plainText: string) {
  return {
    identity,
    label: "Main entry",
    plainText,
    role: "main" as const,
  };
}
