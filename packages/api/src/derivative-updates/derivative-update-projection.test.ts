import { expect, test } from "bun:test";
import {
  invalidComparison,
  projectAuthoredAnchors,
  projectCandidate,
} from "./derivative-update-projection";
import { persistedDerivativeValidationSchema } from "./derivative-update-schemas";

test("projects legacy validation and invalid inactive candidates safely", () => {
  const validation = persistedDerivativeValidationSchema.parse({
    schema: "sep-reading-v1",
    status: "valid",
  });
  expect(validation.checks).toEqual([]);

  const comparison = invalidComparison(undefined, [
    {
      recordType: "annotation",
      recordId: "unavailable",
      componentIdentity: "article",
      normalizedStartOffset: 0,
      normalizedEndOffset: 7,
      exactText: "missing",
      prefix: "",
      suffix: "",
    },
  ]);
  expect(
    projectCandidate({
      id: "50000000-0000-4000-8000-000000000000",
      sourceStateId: "20000000-0000-4000-8000-000000000000",
      generation: {
        version: 2,
        parser: { id: "parse5", version: "7.3.0" },
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: [],
      },
      validation: { status: "invalid", checks: [] },
      comparison,
      createdAt: new Date("2026-08-25T00:00:00.000Z"),
    }),
  ).toMatchObject({
    valid: false,
    comparison: {
      relocations: [
        expect.objectContaining({
          recordId: "unavailable",
          classification: "unresolved",
        }),
      ],
    },
  });
});

test("omits a citation decision after its latest action clears the selection", () => {
  const base = {
    sourceStateId: "20000000-0000-4000-8000-000000000000",
    derivativeId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    mentionId: "citation-one",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 0,
    normalizedEndOffset: 4,
    exactText: "cite",
    prefix: "",
    suffix: "",
    actorId: "user-1",
    method: "manual",
    confidence: null,
    reasoning: null,
    createdAt: new Date("2026-08-25T00:00:00.000Z"),
    updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  };
  const rows: Parameters<typeof projectAuthoredAnchors>[2] = [
    {
      ...base,
      id: "40000000-0000-4000-8000-000000000000",
      action: "selected",
      bibliographyComponentIdentity: "article",
      bibliographyEntryId: "entry-one",
    },
    {
      ...base,
      id: "50000000-0000-4000-8000-000000000000",
      action: "cleared",
      bibliographyComponentIdentity: null,
      bibliographyEntryId: null,
      createdAt: new Date("2026-08-25T00:01:00.000Z"),
      updatedAt: new Date("2026-08-25T00:01:00.000Z"),
    },
  ];

  expect(projectAuthoredAnchors([], [], rows)).toEqual([]);
});
