import { expect, test } from "bun:test";

import { createSepReadingDerivative } from "./sep-reading";

const source = {
  id: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
  title: "Logic",
  authors: ["Alice Example"],
  publisher: "Metaphysics Research Lab, Stanford University",
  publicationHistory: ["First published 2024"],
  canonicalUrl: "https://plato.stanford.edu/entries/logic/",
  observation: "submitted" as const,
  admittedAt: "2026-08-18T12:00:00.000Z",
};

test("resolves additional component citations against the main bibliography", () => {
  const main = {
    identity: "active:/",
    role: "main" as const,
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
    sha256: "a".repeat(64),
    body: Buffer.from(
      '<main><h2>Article</h2><section id="bibliography"><h2>Bibliography</h2><ul><li id="zalta-1983">Zalta, E., 1983. Abstract Objects.</li><li id="zalta-1993">–––, 1993. Twenty-Five Basic Theorems.</li></ul></section></main>',
    ),
    discoveryEdge: "submitted-entry",
  };
  const additionalComponent = {
    ...main,
    identity: "active:/problems-abstractionism.html",
    role: "unknown-component" as const,
    requestedUrl: `${source.canonicalUrl}problems-abstractionism.html`,
    finalUrl: `${source.canonicalUrl}problems-abstractionism.html`,
    sha256: "b".repeat(64),
    body: Buffer.from(
      "<main><h2>Problems for Abstractionism</h2><p>Zalta (1983, 1993).</p></main>",
    ),
    discoveryEdge: "authored:active:/",
  };
  const result = createSepReadingDerivative({
    source,
    main,
    resources: [
      { identity: main.identity, sha256: main.sha256 },
      {
        identity: additionalComponent.identity,
        sha256: additionalComponent.sha256,
      },
    ],
    components: [main, additionalComponent],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
  });

  const component = result.components.find(
    (candidate) => candidate.identity === additionalComponent.identity,
  );
  expect(component?.bibliography).toEqual([]);
  expect(component?.sections[0]?.blocks[0]).toEqual({
    kind: "paragraph",
    children: [
      { kind: "text", text: "Zalta (" },
      {
        kind: "citation",
        mentionId: "citation-mention-1",
        label: "1983",
        state: "resolved",
        candidates: ["zalta-1983"],
        rule: "authored-author-year",
        evidence: "1983",
        entryId: "zalta-1983",
      },
      { kind: "text", text: ", " },
      {
        kind: "citation",
        mentionId: "citation-mention-2",
        label: "1993",
        state: "resolved",
        candidates: ["zalta-1993"],
        rule: "authored-author-year",
        evidence: "1993",
        entryId: "zalta-1993",
      },
      { kind: "text", text: ")." },
    ],
  });
});
