import { describe, expect, test } from "bun:test";

import {
  createSepReadingDerivative,
  readSepReadingDerivative,
} from "./sep-reading";

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
  return createSepReadingDerivative({
    source,
    main: {
      identity: "active:/",
      requestedUrl: source.canonicalUrl,
      finalUrl: source.canonicalUrl,
      retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
      sha256: "a".repeat(64),
      charset: "utf-8",
      body: Buffer.from(html),
    },
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

describe("SEP Reading derivative", () => {
  test("preserves current and historical authored navigation with validated targets", () => {
    const result = derivative(
      `<main><nav id="toc"><ol><li><a href="#direct">Direct</a><ol><li><a href="#legacy">Legacy</a></li></ol></li><li><a href="#missing-toc">Missing TOC target</a></li></ol></nav><h2 id="direct">Direct</h2><a name="legacy"></a><h3><a id="legacy"></a>Legacy</h3><a name="standalone"></a><h2>Standalone</h2><p><a href="#direct">Jump</a> <a href="#missing">Missing</a></p></main>`,
    );

    expect(result.toc).toEqual([
      {
        id: "direct",
        title: "Direct",
        children: [{ id: "legacy", title: "Legacy", children: [] }],
      },
      { id: "missing-toc", title: "Missing TOC target", children: [] },
    ]);
    expect(result.sections.map((section) => section.id)).toEqual([
      "direct",
      "standalone",
    ]);
    expect(result.sections[0]?.children[0]?.id).toBe("legacy");
    expect(JSON.stringify(result.sections)).toContain('"internal":true');
    expect(result.capture.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-internal-target",
        source: { componentIdentity: "active:/", locator: "<a>" },
      }),
    );
    expect(result.capture.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-toc-target",
        source: { componentIdentity: "active:/", locator: "#missing-toc" },
      }),
    );
    expect(readSepReadingDerivative(result)).toEqual(result);
  });

  test("retains typed SEP meaning instead of flattening notation and structure", () => {
    const result = derivative(
      `<main><h2 id="meaning">Meaning</h2><p><em>Emphasis</em> H<sub>2</sub>O x<sup>2</sup> <span data-tex="\\frac{x}{2}"></span> <span class="display" data-tex="\\unknown{x}"></span> <a href="https://example.com">safe</a> <a href="javascript:alert(1)">unsafe</a></p><dl><dt>Definition.</dt><dd>A labeled body.</dd></dl><blockquote>A quotation.</blockquote><ol><li>First</li><li>Second</li></ol><table><caption>Data</caption><tr><th>Term</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table><table><tr><td>Layout</td><td>Only</td></tr></table><figure id="diagram">Diagram</figure></main>`,
    );
    const blocks = result.sections[0]?.blocks ?? [];

    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "statement",
      "quotation",
      "list",
      "table",
      "paragraph",
      "diagnostic",
    ]);
    expect(JSON.stringify(blocks[0])).toContain('"kind":"subscript"');
    expect(JSON.stringify(blocks[0])).toContain('"kind":"superscript"');
    expect(JSON.stringify(blocks[0])).toContain('"source":"\\\\frac{x}{2}"');
    expect(JSON.stringify(blocks[0])).toContain('"display":true');
    expect(result.capture.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-tex-macro" }),
        expect.objectContaining({ code: "unsafe-link" }),
        expect.objectContaining({
          code: "unsupported-structure",
          source: { componentIdentity: "active:/", locator: "#diagram" },
        }),
      ]),
    );
  });

  test("preserves inline spacing and reads content inside ordinary wrappers", () => {
    const result = derivative(
      `<html><body><article><div><h2 id="knowledge">Knowledge</h2><section><p>justified <em>true</em> belief</p></section></div></article></body></html>`,
    );

    expect(result.sections[0]?.title).toEqual([
      { kind: "text", text: "Knowledge" },
    ]);
    expect(result.plainText).toContain("justified true belief");
  });

  test("diagnoses duplicate authored internal targets", () => {
    const result = derivative(
      `<main><h2 id="same">First</h2><h2 id="same">Second</h2></main>`,
    );

    expect(result.capture.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "duplicate-internal-target",
        source: { componentIdentity: "active:/", locator: "#same" },
      }),
    );
  });

  test("does not expose executable captured markup", () => {
    const result = derivative(
      `<main><h2 id="safe">Safe</h2><p>Visible text.</p><script>window.pwned = true</script><p onclick="alert(1)">Still text.</p><style>body { display: none }</style></main>`,
    );
    expect(result.plainText).toContain("Visible text.");
    expect(result.plainText).toContain("Still text.");
    expect(JSON.stringify(result)).not.toContain("window.pwned");
    expect(JSON.stringify(result)).not.toContain("onclick");
  });

  test("derives bibliography apparatus and resolves only unambiguous authored citations", () => {
    const result = derivative(
      `<main><h2 id="knowledge">Knowledge</h2><p>Direct <a href="#ada-2024">Ada 2024</a>; ambiguous <a href="#citation-label">Smith 2024</a>; unresolved <a href="#citation-label">[99]</a>.</p><section id="bibliography"><h2>Bibliography</h2><a id="citation-label"></a><ul><li id="ada-2024">Ada 2024. <a href="https://example.com/ada">Publication</a></li><li id="smith-a">Smith 2024. First edition.</li><li id="smith-b">Smith 2024. Second edition.</li></ul></section></main>`,
    );

    expect(result.sections.map((section) => section.id)).toEqual(["knowledge"]);
    expect(result.components[0]?.bibliography).toEqual([
      expect.objectContaining({
        title: "Bibliography",
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: "ada-2024",
            anchor: "ada-2024",
            links: [
              {
                label: "Publication",
                href: "https://example.com/ada",
                onlineOnly: true,
              },
            ],
            provenance: {
              componentIdentity: "active:/",
              locator: "#ada-2024",
            },
          }),
        ]),
      }),
    ]);
    const citations = JSON.stringify(result.sections);
    expect(citations).toContain('"state":"resolved"');
    expect(citations).toContain('"rule":"authored-fragment-target"');
    expect(citations).toContain('"state":"ambiguous"');
    expect(citations).toContain('"candidates":["smith-a","smith-b"]');
    expect(citations).toContain('"state":"unresolved"');
    expect(readSepReadingDerivative(result)).toEqual(result);
  });

  test("keeps supplements, Notes, figure descriptions, and assets as distinct components", () => {
    const main = {
      identity: "active:/",
      role: "main" as const,
      requestedUrl: source.canonicalUrl,
      finalUrl: source.canonicalUrl,
      retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
      sha256: "a".repeat(64),
      body: Buffer.from(
        `<main><a href="notes.html">Notes</a><a href="supplement.html">Supplement</a><figure id="diagram"><img src="figures/diagram.png" longdesc="diagram-description.html" width="640" height="480" alt="A semantic diagram"><figcaption>Diagram caption</figcaption></figure></main>`,
      ),
      discoveryEdge: "submitted-entry",
    };
    const result = createSepReadingDerivative({
      source,
      main,
      resources: [
        { identity: main.identity, sha256: main.sha256 },
        { identity: "active:/notes.html", sha256: "b".repeat(64) },
        { identity: "active:/supplement.html", sha256: "c".repeat(64) },
        {
          identity: "active:/diagram-description.html",
          sha256: "d".repeat(64),
        },
        { identity: "active:/figures/diagram.png", sha256: "e".repeat(64) },
      ],
      components: [
        main,
        {
          ...main,
          identity: "active:/notes.html",
          role: "notes" as const,
          requestedUrl: "https://plato.stanford.edu/entries/logic/notes.html",
          finalUrl: "https://plato.stanford.edu/entries/logic/notes.html",
          sha256: "b".repeat(64),
          body: Buffer.from('<main><h2 id="n">Note</h2></main>'),
          discoveryEdge: "authored:active:/",
        },
        {
          ...main,
          identity: "active:/supplement.html",
          role: "supplement" as const,
          requestedUrl:
            "https://plato.stanford.edu/entries/logic/supplement.html",
          finalUrl: "https://plato.stanford.edu/entries/logic/supplement.html",
          sha256: "c".repeat(64),
          body: Buffer.from('<main><h2 id="s">Supplement</h2></main>'),
          discoveryEdge: "authored:active:/",
        },
        {
          ...main,
          identity: "active:/diagram-description.html",
          role: "figure-description" as const,
          requestedUrl:
            "https://plato.stanford.edu/entries/logic/diagram-description.html",
          finalUrl:
            "https://plato.stanford.edu/entries/logic/diagram-description.html",
          sha256: "d".repeat(64),
          body: Buffer.from("<main><p>Exact figure description.</p></main>"),
          discoveryEdge: "authored:active:/",
        },
        {
          ...main,
          identity: "active:/figures/diagram.png",
          role: "semantic-asset" as const,
          requestedUrl:
            "https://plato.stanford.edu/entries/logic/figures/diagram.png",
          finalUrl:
            "https://plato.stanford.edu/entries/logic/figures/diagram.png",
          sha256: "e".repeat(64),
          mediaType: "image/png",
          body: Buffer.from("png"),
          discoveryEdge: "authored:active:/",
        },
      ],
      capture: {
        completeness: "complete",
        readingReadiness: "ready",
        readinessReasons: [],
        diagnostics: [],
      },
    });

    expect(
      result.components.map((component) => [
        component.identity,
        component.label,
        component.parentIdentity,
      ]),
    ).toEqual([
      ["active:/", "Article", undefined],
      ["active:/notes.html", "Notes", "active:/"],
      ["active:/supplement.html", "Supplement", "active:/"],
      ["active:/diagram-description.html", "Figure description", "active:/"],
    ]);
    expect(result.components[0]?.figures).toEqual([
      expect.objectContaining({
        id: "diagram",
        assetIdentity: "active:/figures/diagram.png",
        assetDataUrl: "data:image/png;base64,cG5n",
        dimensions: { width: 640, height: 480 },
        description: expect.objectContaining({
          componentIdentity: "active:/diagram-description.html",
        }),
      }),
    ]);
  });
});
