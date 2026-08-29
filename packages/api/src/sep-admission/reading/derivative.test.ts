import { describe, expect, test } from "bun:test";

import { authoredTargetForPublisherAnchor } from "../../authored-targets/authored-target";
import { validateReadingCandidate } from "../../derivative-updates/derivative-validation";
import { readSepReadingDerivative } from "./contract";
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
    expect(validateReadingCandidate(result).status).toBe("valid");
    expect(readSepReadingDerivative(result)).toEqual(result);
  });
  test("retains legacy block targets and generated proposition numbers", () => {
    const numberedRows = Array.from(
      { length: 6 },
      (_, index) =>
        `<a name="claim-${index + 1}"></a><table><tr><td class="numbered"></td><td>Claim ${index + 1}</td></tr></table>`,
    ).join("");
    const result = derivative(
      `<main><h2 id="claims">Claims</h2>${numberedRows}<p><a href="${source.canonicalUrl}#claim-6">Return to (6)</a></p></main>`,
    );

    expect(JSON.stringify(result.sections)).toContain(
      '"kind":"anchor","id":"claim-6"',
    );
    expect(result.plainText).toContain("(6) Claim 6");
    expect(JSON.stringify(result.sections)).toContain('"internal":true');
    expect(readSepReadingDerivative(result)).toEqual(result);
  });
  test("keeps the left navigation while excluding SEP utility sections from reading", () => {
    const result = derivative(
      `<div id="article-sidebar"><ul><li>Academic Tools</li></ul></div><div id="article-content"><div id="aueditable"><div id="preamble"><p>Preamble content.</p></div><div id="toc"><ul><li><a href="#keep">Keep</a></li><li><a href="#Bib">Bibliography</a></li><li><a href="#Aca">Academic Tools</a></li><li><a href="#Oth">Other Internet Resources</a></li><li><a href="#Rel">Related Entries</a></li></ul></div><div id="main-text"><h2 id="keep">Keep</h2><p>Reading content.</p></div><div id="bibliography"><h2 id="Bib">Bibliography</h2><ul><li>Reference one.</li></ul></div><div id="academic-tools"><h2 id="Aca">Academic Tools</h2><p>Tool content.</p></div><div id="other-internet-resources"><h2 id="Oth">Other Internet Resources</h2><p>Other content.</p></div><div id="related-entries"><h2 id="Rel">Related Entries</h2><p>Related content.</p></div></div></div>`,
    );
    expect(result.toc).toEqual([{ id: "keep", title: "Keep", children: [] }]);
    expect(result.sections.map((section) => section.id)).toEqual(["keep"]);
    expect(result.plainText).toContain("Reading content.");
    expect(result.plainText).not.toContain("Academic Tools");
    expect(result.plainText).not.toContain("Tool content.");
    expect(result.plainText).not.toContain("Other content.");
    expect(result.plainText).not.toContain("Related content.");
    expect(result.components[0]?.bibliography[0]?.title).toBe("Bibliography");
  });
  test("retains typed SEP meaning instead of flattening notation and structure", () => {
    const result = derivative(
      `<main><h2 id="meaning">Meaning</h2><p><em>Emphasis</em> H<sub>2</sub>O x<sup>2</sup> <span data-tex="\\frac{x}{2}"></span> <span class="display" data-tex="\\unknown{x}"></span> <a href="https://example.com">safe</a> <a href="javascript:alert(1)">unsafe</a></p><dl><dt>Definition.</dt><dd>A labeled body.</dd></dl><blockquote>A quotation.</blockquote><ol><li>First</li><li>Second</li></ol><a name="evidence-table"></a><table><caption>Data</caption><tr><th>Term</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table><table><tr><td>Layout</td><td>Only</td></tr></table><figure id="diagram">Diagram</figure></main>`,
    );
    const blocks = result.sections[0]?.blocks ?? [];
    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "statement",
      "quotation",
      "list",
      "table",
      "paragraph",
      "figure",
    ]);
    expect(JSON.stringify(blocks[0])).toContain('"kind":"subscript"');
    expect(JSON.stringify(blocks[0])).toContain('"kind":"superscript"');
    expect(JSON.stringify(blocks[0])).toContain('"source":"\\\\frac{x}{2}"');
    expect(JSON.stringify(blocks[0])).toContain('"display":true');
    expect(result.capture.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-tex-macro" }),
        expect.objectContaining({ code: "unsafe-link" }),
      ]),
    );
    expect(result.plainText).toBe(
      "Meaning\n\nEmphasis H2O x2 \\frac{x}{2} \\unknown{x} safe unsafe\n\nDefinition. A labeled body.\n\nA quotation.\n\nFirst Second\n\nData Term Value A B\n\nLayout Only",
    );
    const component = result.components[0];
    if (!component) throw new Error("Reading component missing");
    expect(
      authoredTargetForPublisherAnchor(component, "meaning"),
    ).toMatchObject({
      normalizedStartOffset: 0,
      normalizedEndOffset: result.plainText.length,
      exactText: result.plainText,
    });
    expect(
      authoredTargetForPublisherAnchor(component, "evidence-table"),
    ).toMatchObject({ exactText: "Data Term Value A B" });
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
  test("rejects a typed Derivative whose canonical authored text disagrees with its content", () => {
    const result = derivative(
      '<main><h2 id="knowledge">Knowledge</h2><p>Evidence.</p></main>',
    );
    const component = result.components[0];
    if (!component) throw new Error("Reading component missing");
    component.plainText = "Different text";

    expect(() => readSepReadingDerivative(result)).toThrow();
  });
  test("rejects a typed Derivative whose main Source component is missing", () => {
    const result = derivative(
      '<main><h2 id="knowledge">Knowledge</h2><p>Evidence.</p></main>',
    );
    result.mainComponent.identity = "missing-component";

    expect(() => readSepReadingDerivative(result)).toThrow();
  });
  test("calculates publisher spans when it reads a version-one payload", () => {
    const persisted = JSON.parse(
      JSON.stringify(
        derivative(
          '<main><h2 id="tables">Tables</h2><table><caption>Data</caption><tr><th>Head</th></tr><tr><td>Body</td></tr></table></main>',
        ),
      ),
    );
    persisted.version = 1;
    persisted.components[0].plainText = "Tables\n\nBody";
    persisted.plainText = "Tables\n\nBody";
    expect(JSON.stringify(persisted)).not.toContain("publisherAnchorSpans");

    const reading = readSepReadingDerivative(persisted);
    const component = reading.components[0];
    if (!component) throw new Error("Reading component missing");
    expect(authoredTargetForPublisherAnchor(component, "tables")).toMatchObject(
      { exactText: "Tables\n\nBody" },
    );
  });
  test("calculates publisher spans for header-only tables and inline anchors", () => {
    const result = derivative(
      '<main><h2 id="anchors">Anchors</h2><a name="header-table"></a><table><tr><th>Term</th></tr></table><p>Before <a id="inline-term">term</a> after.</p></main>',
    );
    const component = result.components[0];
    if (!component) throw new Error("Reading component missing");

    expect(
      authoredTargetForPublisherAnchor(component, "header-table"),
    ).toMatchObject({ exactText: "Term" });
    expect(
      authoredTargetForPublisherAnchor(component, "inline-term"),
    ).toMatchObject({ exactText: "term" });
  });
  test("excludes Lirna diagnostics from canonical authored text", () => {
    const result = derivative(
      '<main><h2 id="knowledge">Knowledge</h2><aside>Unsupported publication structure.</aside><p>Evidence.</p></main>',
    );

    expect(result.plainText).toBe("Knowledge\n\nEvidence.");
    expect(result.sections[0]?.blocks.map((block) => block.kind)).toEqual([
      "diagnostic",
      "paragraph",
    ]);
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
      ["active:/diagram-description.html", "Figure description", "active:/"],
      ["active:/notes.html", "Notes", "active:/"],
      ["active:/supplement.html", "Supplement", "active:/"],
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
