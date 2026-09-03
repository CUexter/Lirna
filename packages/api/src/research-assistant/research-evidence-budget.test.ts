import { expect, test } from "bun:test";

import { createResearchEvidenceSession } from "./research-evidence-tools";

const components = [
  {
    identity: "active:/",
    label: "Main entry",
    plainText: "Alpha evidence.\n\nBeta evidence.",
    role: "main" as const,
  },
];

test("bounds discoveries and candidates per discovery", async () => {
  const session = createResearchEvidenceSession({
    components,
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    budget: budget({ maximumDiscoveries: 1, maximumCandidatesPerDiscovery: 1 }),
  });

  const first = await session.discover({
    intent: "alpha beta evidence",
    componentScope: ["active:/"],
    limit: 5,
  });
  const second = await session.discover({
    intent: "alpha evidence",
    componentScope: ["active:/"],
    limit: 5,
  });

  expect(first).toMatchObject({ outcome: "ambiguous", candidateCount: 1 });
  expect(second).toEqual({
    kind: "evidence-resolution",
    outcome: "budget-exhausted",
    reasonCode: "discovery-budget-exhausted",
    componentScope: ["active:/"],
  });
  expect(session.snapshot().consumption).toMatchObject({
    discoveries: 1,
    candidates: 1,
  });
});

test("bounds admissions and total admitted evidence characters", async () => {
  const session = createResearchEvidenceSession({
    components,
    sourceStateId: "state-one",
    derivativeId: "derivative-one",
    budget: budget({
      maximumAdmissions: 2,
      maximumTotalEvidenceCharacters: 15,
    }),
  });
  const alpha = await session.discover({
    intent: "alpha evidence",
    componentScope: ["active:/"],
    limit: 1,
  });
  const beta = await session.discover({
    intent: "beta evidence",
    componentScope: ["active:/"],
    limit: 1,
  });
  if (alpha.outcome !== "candidates" || beta.outcome !== "candidates")
    throw new Error("Expected evidence candidates");

  const admitted = await session.admit({
    candidateHandle: alpha.candidates[0]?.handle ?? "",
  });
  const exhausted = await session.admit({
    candidateHandle: beta.candidates[0]?.handle ?? "",
  });
  const admissionLimit = await session.admit({
    candidateHandle: alpha.candidates[0]?.handle ?? "",
  });

  expect(admitted).toMatchObject({
    outcome: "admitted",
    passage: "Alpha evidence.",
  });
  expect(exhausted).toMatchObject({
    outcome: "budget-exhausted",
    reasonCode: "evidence-character-budget-exhausted",
  });
  expect(admissionLimit).toMatchObject({
    outcome: "budget-exhausted",
    reasonCode: "admission-budget-exhausted",
  });
  expect(session.snapshot().consumption).toMatchObject({
    admissions: 2,
    evidenceCharacters: 15,
  });
});

test("rejects budgets that cannot reserve ledger preparation and synthesis", () => {
  expect(() =>
    createResearchEvidenceSession({
      components,
      sourceStateId: "state-one",
      derivativeId: "derivative-one",
      budget: budget({ maximumModelSteps: 2 }),
    }),
  ).toThrow(
    "maximumModelSteps must reserve ledger preparation, repair, and synthesis",
  );
});

function budget(overrides: Record<string, number>) {
  return {
    maximumDiscoveries: 12,
    maximumCandidatesPerDiscovery: 5,
    maximumAdmissions: 12,
    maximumModelSteps: 8,
    maximumTotalEvidenceCharacters: 100_000,
    ...overrides,
  };
}
