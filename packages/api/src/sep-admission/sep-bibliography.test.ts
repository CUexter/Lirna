import { expect, test } from "bun:test";

import { createSepReadingDerivative } from "./sep-reading";
import { readSepReadingDerivative } from "./sep-reading-contract";

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

function derivative(html: string) {
  const main = {
    identity: "active:/",
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
    sha256: "a".repeat(64),
    charset: "utf-8",
    body: Buffer.from(html),
  };
  return createSepReadingDerivative({
    source,
    main,
    resources: [
      { identity: "citation-information:logic", sha256: "b".repeat(64) },
      { identity: "active:/", sha256: "a".repeat(64) },
    ],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
  });
}

function derivativeWithSupplement(mainHtml: string, supplementHtml: string) {
  const retrievedAt = new Date("2026-08-17T12:00:00.000Z");
  const main = {
    identity: "active:/",
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt,
    sha256: "a".repeat(64),
    charset: "utf-8",
    body: Buffer.from(mainHtml),
  };
  const supplement = {
    identity: "active:/supplement.html",
    role: "supplement" as const,
    requestedUrl: `${source.canonicalUrl}supplement.html`,
    finalUrl: `${source.canonicalUrl}supplement.html`,
    retrievedAt,
    sha256: "c".repeat(64),
    charset: "utf-8",
    body: Buffer.from(supplementHtml),
    discoveryEdge: "authored:active:/",
  };
  return createSepReadingDerivative({
    source,
    main,
    resources: [
      { identity: "citation-information:logic", sha256: "b".repeat(64) },
      { identity: main.identity, sha256: main.sha256 },
      { identity: supplement.identity, sha256: supplement.sha256 },
    ],
    components: [
      {
        ...main,
        role: "main",
        discoveryEdge: "submitted-entry",
      },
      supplement,
    ],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
  });
}

test("preserves authored bibliography subgroup headings", () => {
  const result = derivative(
    `<main><h2>Article</h2><p>Text.</p><section id="bibliography"><h2>Bibliography</h2><h3 id="primary">Primary works</h3><ul><li id="locke">Locke, 1689.</li></ul><h3 id="secondary">Secondary works</h3><ul><li id="ada">Ada, 2024.</li></ul></section></main>`,
  );

  expect(result.components[0]?.bibliography).toEqual([
    expect.objectContaining({
      id: "primary",
      title: "Primary works",
      entries: [expect.objectContaining({ id: "locke" })],
    }),
    expect.objectContaining({
      id: "secondary",
      title: "Secondary works",
      entries: [expect.objectContaining({ id: "ada" })],
    }),
  ]);
});

test("extracts plain author-year citation formats and links only unique entries", () => {
  const result = derivative(
    `<main><h2 id="knowledge">Knowledge</h2><p>Resolved in prose (Ada, 2024); ambiguous in prose (Smith, 2024); unknown (Jones 2024), then resolved (Ada, 2024).</p><p>Locke (1689), Tarski (1933, 1944), (Égré 2018; Lewis 1986, 86), van Fraassen (1980), and Armstrong (1986a, ch. 5).</p><section id="bibliography"><h2>Bibliography</h2><ul><li id="ada-2024">Ada, Augusta. 2024. Notes on engines.</li><li id="smith-a">Smith, Alice. 2024. First edition.</li><li id="smith-b">Smith, Bob. 2024. Second edition.</li><li id="locke-1689">Locke, J., 1689, An Essay.</li><li id="tarski-1933">Tarski, A., 1933, Truth.</li><li id="tarski-1944">——, 1944, Semantic truth.</li><li id="egre-2018">Égré, P., 2018, Vagueness.</li><li id="lewis-1986">Lewis, D., 1986, Plurality.</li><li id="fraassen-1980">van Fraassen, B., 1980, The Scientific Image.</li><li id="armstrong-1986a">Armstrong, D., 1986a, Possibility.</li></ul></section></main>`,
  );

  const paragraph = result.sections[0]?.blocks[0];
  expect(paragraph?.kind).toBe("paragraph");
  if (paragraph?.kind !== "paragraph") throw new Error("Missing paragraph");
  expect(paragraph.children).toEqual([
    { kind: "text", text: "Resolved in prose " },
    expect.objectContaining({
      kind: "citation",
      label: "(Ada, 2024)",
      state: "resolved",
      entryId: "ada-2024",
      candidates: ["ada-2024"],
      rule: "authored-author-year",
    }),
    { kind: "text", text: "; ambiguous in prose " },
    expect.objectContaining({
      kind: "citation",
      label: "(Smith, 2024)",
      state: "ambiguous",
      candidates: ["smith-a", "smith-b"],
      rule: "authored-author-year",
    }),
    { kind: "text", text: "; unknown (Jones 2024), then resolved " },
    expect.objectContaining({
      kind: "citation",
      label: "(Ada, 2024)",
      state: "resolved",
      entryId: "ada-2024",
    }),
    { kind: "text", text: "." },
  ]);
  expect(result.plainText).toContain(
    "Resolved in prose (Ada, 2024); ambiguous in prose (Smith, 2024); unknown (Jones 2024), then resolved (Ada, 2024).",
  );
  const formatParagraph = result.sections[0]?.blocks[1];
  expect(formatParagraph?.kind).toBe("paragraph");
  if (formatParagraph?.kind !== "paragraph")
    throw new Error("Missing format paragraph");
  expect(
    formatParagraph.children
      .filter((inline) => inline.kind === "citation")
      .map((inline) => ({ label: inline.label, entryId: inline.entryId })),
  ).toEqual([
    { label: "Locke (1689)", entryId: "locke-1689" },
    { label: "1933", entryId: "tarski-1933" },
    { label: "1944", entryId: "tarski-1944" },
    { label: "Égré 2018", entryId: "egre-2018" },
    { label: "Lewis 1986", entryId: "lewis-1986" },
    { label: "van Fraassen (1980)", entryId: "fraassen-1980" },
    { label: "1986a", entryId: "armstrong-1986a" },
  ]);
  expect(readSepReadingDerivative(result)).toEqual(result);
});

test("resolves supplementary links to the main component bibliography", () => {
  const result = derivativeWithSupplement(
    `<main><h2>Article</h2><section id="bibliography"><h2>Bibliography</h2><ul><li id="ada-2024">Ada, Augusta. 2024. Notes on engines.</li></ul></section></main>`,
    `<main><h2>Supplement</h2><p>See <a href="./#ada-2024">Ada, 2024</a>.</p></main>`,
  );

  const supplement = result.components.find(
    (component) => component.role === "supplement",
  );
  const paragraph = supplement?.sections[0]?.blocks[0];
  expect(paragraph?.kind).toBe("paragraph");
  if (paragraph?.kind !== "paragraph") throw new Error("Missing paragraph");
  expect(paragraph.children).toContainEqual(
    expect.objectContaining({
      kind: "citation",
      label: "Ada, 2024",
      state: "resolved",
      entryId: "ada-2024",
      rule: "authored-fragment-target",
    }),
  );
});
