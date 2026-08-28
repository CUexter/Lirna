import { expect, test } from "bun:test";
import type { CitationResolutionRecord } from "../citation-resolutions/citation-resolution-contract";
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

test("adapts a current Citation resolution into an authored anchor", () => {
  const resolution: CitationResolutionRecord = {
    id: "40000000-0000-4000-8000-000000000000",
    sourceId: "10000000-0000-4000-8000-000000000000",
    sourceStateId: "20000000-0000-4000-8000-000000000000",
    derivativeId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    mentionId: "citation-one",
    bibliographyComponentIdentity: "article",
    bibliographyEntryId: "entry-one",
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
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };

  expect(projectAuthoredAnchors([], [], [resolution])).toEqual([
    expect.objectContaining({
      recordType: "citation-resolution",
      recordId: resolution.id,
      derivativeId: resolution.derivativeId,
      bibliographyComponentIdentity: resolution.bibliographyComponentIdentity,
      bibliographyEntryId: resolution.bibliographyEntryId,
    }),
  ]);
});
