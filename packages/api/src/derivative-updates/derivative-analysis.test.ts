import { describe, expect, test } from "bun:test";
import { compareReadingDerivatives } from "./derivative-analysis";
import { derivativeReadingFixture as reading } from "./derivative-test-fixture";
import { validateReadingCandidate } from "./derivative-validation";

describe("Reading Derivative validation and comparison", () => {
  test("rejects invalid typed structure and reports every blocked check", () => {
    const validation = validateReadingCandidate({ version: 2 });

    expect(validation.status).toBe("invalid");
    expect(validation.checks).toHaveLength(8);
    expect(validation.checks.every(({ status }) => status === "failed")).toBe(
      true,
    );
  });

  test("validates structure, references, notation, figures, apparatus, and diagnostics", () => {
    const validation = validateReadingCandidate(reading("Alpha target Omega"));

    expect(validation).toEqual({
      status: "valid",
      checks: expect.arrayContaining([
        expect.objectContaining({
          subject: "typed-structure",
          status: "passed",
        }),
        expect.objectContaining({
          subject: "internal-targets",
          status: "passed",
        }),
        expect.objectContaining({
          subject: "component-resources",
          status: "passed",
        }),
        expect.objectContaining({ subject: "notation", status: "passed" }),
        expect.objectContaining({ subject: "figures", status: "passed" }),
        expect.objectContaining({ subject: "footnotes", status: "passed" }),
        expect.objectContaining({ subject: "bibliography", status: "passed" }),
        expect.objectContaining({ subject: "diagnostics", status: "passed" }),
      ]),
    });
  });

  test("rejects targets and Bibliography entries found only in unrelated components", () => {
    const candidate = reading("Alpha target Omega");
    const article = candidate.components[0];
    if (!article) throw new Error("Article fixture missing");
    article.introductoryBlocks = [
      {
        kind: "paragraph",
        children: [
          { kind: "link", href: "#foreign", internal: true, children: [] },
          {
            kind: "citation",
            mentionId: "foreign-citation",
            label: "[2]",
            state: "resolved",
            candidates: ["foreign-entry"],
            rule: "authored-fragment-target",
            evidence: "#foreign-entry",
            entryId: "foreign-entry",
          },
        ],
      },
    ];
    candidate.components.push({
      ...article,
      identity: "supplement",
      role: "supplement",
      order: 1,
      sha256: "b".repeat(64),
      introductoryBlocks: [
        {
          kind: "paragraph",
          children: [{ kind: "anchor", id: "foreign", children: [] }],
        },
      ],
      bibliography: [
        {
          id: "foreign-references",
          title: "Foreign references",
          entries: [
            {
              id: "foreign-entry",
              label: "[2]",
              text: "Foreign reference",
              anchor: "#foreign-entry",
              links: [],
              provenance: {
                componentIdentity: "supplement",
                locator: "#foreign-entry",
              },
            },
          ],
          provenance: {
            componentIdentity: "supplement",
            locator: "#foreign-references",
          },
        },
      ],
    });
    candidate.provenance.inputResourceHashes.push({
      identity: "supplement",
      sha256: "b".repeat(64),
    });

    const validation = validateReadingCandidate(candidate);
    expect(
      validation.checks.filter(({ status }) => status === "failed"),
    ).toEqual([
      expect.objectContaining({ subject: "internal-targets" }),
      expect.objectContaining({ subject: "bibliography" }),
    ]);
  });

  test("classifies exact, context-relocated, ambiguous, and unresolved authored records", () => {
    const candidate = reading(
      "Alpha target Omega\n\nAlpha moved Omega\n\nAlpha moved Omega",
    );
    const comparison = compareReadingDerivatives(
      reading("Alpha target Omega"),
      candidate,
      "30000000-0000-4000-8000-000000000000",
      [
        anchor("annotation-exact", "annotation", "target", 6),
        anchor("position-context", "reading-position", "target", 0),
        anchor("citation-ambiguous", "citation-resolution", "moved", 0),
        anchor("annotation-unresolved", "annotation", "missing", 0),
      ],
    );

    expect(
      comparison.relocations.map(({ recordId, classification }) => ({
        recordId,
        classification,
      })),
    ).toEqual([
      { recordId: "annotation-exact", classification: "exact" },
      { recordId: "position-context", classification: "context-relocated" },
      { recordId: "citation-ambiguous", classification: "ambiguous" },
      { recordId: "annotation-unresolved", classification: "unresolved" },
    ]);
    expect(comparison.relocations[2]?.original.derivativeId).toBe(
      "40000000-0000-4000-8000-000000000000",
    );
    expect(comparison.relocations[2]?.target).toBeUndefined();
    expect(comparison.relocations[3]?.target).toBeUndefined();
    expect(comparison.semantic.changedComponents).toEqual([
      {
        identity: "article",
        beforeTextSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        afterTextSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
  });

  test("keeps a citation resolution unresolved when its selected entry disappears", () => {
    const candidate = reading("Alpha target Omega");
    const component = candidate.components[0];
    if (!component) throw new Error("Article fixture missing");
    component.bibliography = [];
    const comparison = compareReadingDerivatives(
      reading("Alpha target Omega"),
      candidate,
      "30000000-0000-4000-8000-000000000000",
      [anchor("citation-missing-entry", "citation-resolution", "target", 6)],
    );

    expect(comparison.relocations[0]).toMatchObject({
      recordId: "citation-missing-entry",
      classification: "unresolved",
      candidates: 0,
    });
  });
});

function anchor(
  recordId: string,
  recordType: "annotation" | "reading-position" | "citation-resolution",
  exactText: string,
  normalizedStartOffset: number,
) {
  return {
    recordId,
    recordType,
    componentIdentity: "article",
    ...(recordType === "citation-resolution"
      ? {
          derivativeId: "40000000-0000-4000-8000-000000000000",
          bibliographyComponentIdentity: "article",
          bibliographyEntryId: "entry-one",
        }
      : {}),
    normalizedStartOffset,
    normalizedEndOffset: normalizedStartOffset + exactText.length,
    exactText,
    prefix: "Alpha ",
    suffix: " Omega",
  };
}
