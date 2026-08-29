import { describe, expect, test } from "bun:test";

import { createSepReadingDerivative } from "./derivative";

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

describe("SEP Reading derivative determinism", () => {
  test("generates identical derivatives from reordered resources", () => {
    const main = {
      identity: "active:/",
      role: "main" as const,
      requestedUrl: source.canonicalUrl,
      finalUrl: source.canonicalUrl,
      retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
      sha256: "a".repeat(64),
      body: Buffer.from('<main><h2 id="article">Article</h2></main>'),
      discoveryEdge: "submitted-entry",
    };
    const notes = {
      ...main,
      identity: "active:/notes.html",
      role: "notes" as const,
      requestedUrl: "https://plato.stanford.edu/entries/logic/notes.html",
      finalUrl: "https://plato.stanford.edu/entries/logic/notes.html",
      sha256: "b".repeat(64),
      body: Buffer.from('<main><h2 id="notes">Notes</h2></main>'),
      discoveryEdge: "authored:active:/",
    };
    const supplement = {
      ...main,
      identity: "active:/supplement.html",
      role: "supplement" as const,
      requestedUrl: "https://plato.stanford.edu/entries/logic/supplement.html",
      finalUrl: "https://plato.stanford.edu/entries/logic/supplement.html",
      sha256: "c".repeat(64),
      body: Buffer.from('<main><h2 id="supplement">Supplement</h2></main>'),
      discoveryEdge: "authored:active:/",
    };
    const create = (
      components: Array<typeof main | typeof notes | typeof supplement>,
    ) =>
      createSepReadingDerivative({
        source,
        main,
        resources: components.map(({ identity, sha256 }) => ({
          identity,
          sha256,
        })),
        components,
        capture: {
          completeness: "complete",
          readingReadiness: "ready",
          readinessReasons: [],
          diagnostics: [],
        },
      });

    const ordered = create([main, notes, supplement]);
    const reordered = create([supplement, main, notes]);

    expect(JSON.stringify(reordered)).toBe(JSON.stringify(ordered));
    expect(ordered.components.map((component) => component.identity)).toEqual([
      "active:/",
      "active:/notes.html",
      "active:/supplement.html",
    ]);
    expect(ordered.components.map((component) => component.order)).toEqual([
      0, 1, 2,
    ]);
  });
});
