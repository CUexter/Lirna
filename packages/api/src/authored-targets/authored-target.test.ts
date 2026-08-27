import { describe, expect, test } from "bun:test";

import type { ReadingComponent } from "../sep-admission/sep-reading-contract";
import {
  authoredTargetForPublisherAnchor,
  authoredTargetInputSchema,
  validateAuthoredTarget,
} from "./authored-target";

describe("authored targets", () => {
  test("derives the exact publisher anchor when labels repeat", () => {
    const component = readingComponent();

    const target = authoredTargetForPublisherAnchor(component, "mention-two");

    expect(target).toEqual({
      publisherAnchor: "mention-two",
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 5,
      normalizedEndOffset: 10,
      exactText: "Smith",
      prefix: "Smith",
      suffix: "",
    });
    expect(() => validateAuthoredTarget(component, target)).not.toThrow();
  });

  test("owns range and exact-text transport invariants", () => {
    const parsed = authoredTargetInputSchema.safeParse({
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 5,
      normalizedEndOffset: 10,
      exactText: "short",
      prefix: "",
      suffix: "",
    });
    const invalid = authoredTargetInputSchema.safeParse({
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 10,
      normalizedEndOffset: 5,
      exactText: "short",
      prefix: "",
      suffix: "",
    });

    expect(parsed.success).toBeTrue();
    expect(invalid.success).toBeFalse();
  });
});

function readingComponent(): ReadingComponent {
  const citation = (mentionId: string) => ({
    kind: "citation" as const,
    mentionId,
    label: "Smith",
    state: "unresolved" as const,
    candidates: [],
    rule: "test",
    evidence: "Smith",
  });
  return {
    identity: "article:main",
    role: "main",
    label: "Article",
    order: 0,
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com",
    retrievedAt: "2026-08-27T00:00:00.000Z",
    sha256: "a".repeat(64),
    toc: [],
    introductoryBlocks: [
      {
        kind: "paragraph",
        children: [citation("mention-one"), citation("mention-two")],
      },
    ],
    sections: [],
    figures: [],
    bibliography: [],
    plainText: "SmithSmith",
  };
}
