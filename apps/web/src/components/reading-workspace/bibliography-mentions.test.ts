import { expect, test } from "bun:test";
import type { CitationResolution } from "../annotations/dom-utils";
import { indexBibliographyMentions } from "./bibliography-mentions";
import { readingFixture } from "./reading-test-fixtures";

test("indexes authored and manual Bibliography mentions together", () => {
  const reading = readingFixture();
  const resolution: CitationResolution = {
    id: "40000000-0000-4000-8000-000000000000",
    sourceId: reading.source.id,
    sourceStateId: reading.source.stateId,
    derivativeId: "50000000-0000-4000-8000-000000000000",
    componentIdentity: reading.mainComponent.identity,
    mentionId: "citation-one",
    bibliographyComponentIdentity: reading.mainComponent.identity,
    bibliographyEntryId: "entry-one",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 2,
    normalizedEndOffset: 11,
    exactText: "synthetic",
    prefix: "A ",
    suffix: " Source state passage.",
    actorId: "local-owner",
    method: "manual",
    confidence: null,
    reasoning: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };

  const mentions = indexBibliographyMentions(
    reading.components,
    reading.mainComponent.identity,
    [resolution],
  ).get("article:entry-one");

  expect(
    mentions?.filter((mention) => mention.origin === "authored"),
  ).toHaveLength(2);
  const manual = mentions?.find(
    (mention) => mention.origin === "manual-resolution",
  );
  expect(manual?.context).toBe("A synthetic Source state passage.");
});
