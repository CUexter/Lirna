import { expect, test } from "bun:test";
import { compareReadingDerivatives } from "./derivative-analysis";
import { derivativeReadingFixture as reading } from "./derivative-test-fixture";
import { validateReadingCandidate } from "./derivative-validation";

test("requires the precise Footnote component and fragment target", () => {
  const candidate = reading("Alpha target Omega");
  const article = candidate.components[0];
  if (!article) throw new Error("Article fixture missing");
  article.introductoryBlocks = [
    {
      kind: "paragraph",
      children: [
        {
          kind: "link",
          href: "notes.html#note-one",
          internal: false,
          children: [{ kind: "text", text: "1" }],
        },
      ],
    },
  ];
  candidate.components.push({
    ...article,
    identity: "notes",
    role: "notes",
    order: 1,
    requestedUrl: "https://example.test/notes.html",
    finalUrl: "https://example.test/notes.html",
    sha256: "b".repeat(64),
    introductoryBlocks: [],
    bibliography: [],
  });
  candidate.provenance.inputResourceHashes.push({
    identity: "notes",
    sha256: "b".repeat(64),
  });

  expect(footnoteStatus(candidate)).toBe("failed");
  candidate.components[1]?.introductoryBlocks.push({
    kind: "paragraph",
    children: [{ kind: "anchor", id: "note-one", children: [] }],
  });
  expect(footnoteStatus(candidate)).toBe("passed");
});

test("detects reordered structure and changed diagnostic text", () => {
  const before = reading("Alpha target Omega");
  const after = structuredClone(before);
  const firstEntry = after.components[0]?.bibliography[0]?.entries[0];
  if (!firstEntry) throw new Error("Bibliography fixture missing");
  before.components[0]?.bibliography[0]?.entries.push({
    ...firstEntry,
    id: "entry-two",
  });
  after.components[0]?.bibliography[0]?.entries.unshift({
    ...firstEntry,
    id: "entry-two",
  });
  before.capture.diagnostics.push(diagnostic("Original message"));
  after.capture.diagnostics.push(diagnostic("Changed message"));

  const comparison = compareReadingDerivatives(before, after, undefined, []);
  const bibliography = comparison.structure.find(
    ({ subject }) => subject === "bibliography",
  );
  expect(bibliography).toMatchObject({ before: 2, after: 2 });
  expect(bibliography?.beforeSha256).not.toBe(bibliography?.afterSha256);
  expect(comparison.diagnostics.added).toHaveLength(1);
  expect(comparison.diagnostics.removed).toHaveLength(1);
});

function footnoteStatus(candidate: ReturnType<typeof reading>) {
  return validateReadingCandidate(candidate).checks.find(
    ({ subject }) => subject === "footnotes",
  )?.status;
}

function diagnostic(message: string) {
  return {
    level: "warning" as const,
    code: "changed-diagnostic",
    message,
    source: { componentIdentity: "article", locator: "#target" },
  };
}
