import type { FixturePage } from "../sep-capture-test-fixture";
import { html, image } from "../sep-capture-test-fixture";

export const productionEntryUrl =
  "https://plato.stanford.edu/entries/synthetic-production/";
export const productionArchiveEntryUrl =
  "https://plato.stanford.edu/archives/sum2026/entries/synthetic-production/";

export const productionAssetBytes = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

export function productionCorpusPages() {
  return new Map<string, FixturePage>([
    [
      "/entries/synthetic-production/",
      html(`<main id="article-content">
        <nav id="toc"><ol><li><a href="#claim">Synthetic claim</a></li></ol></nav>
        <h2 id="claim">Synthetic claim</h2>
        <p>Controlled prose cites <a href="#ada-2024">Ada 2024</a> and <a href="#smith-label">Smith 2024</a>.</p>
        <dl class="sentag"><dt>SP.</dt><dd>A publisher-tagged synthetic statement.</dd></dl>
        <p>H<sub>2</sub>O <span data-tex="\\frac{x}{2}"></span> <span class="display" data-tex="\\unknown{x}"></span>.</p>
        <table><caption>Synthetic distinctions</caption><tr><th>Term</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table>
        <a href="notes.html#note-one">Publisher Footnote 1</a>
        <figure id="diagram"><img src="diagram.gif" longdesc="diagram-description.html" alt="Synthetic relation diagram"><figcaption>A controlled figure.</figcaption></figure>
        <section id="bibliography"><h2>Bibliography</h2><a id="smith-label"></a><ul>
          <li id="ada-2024">Ada 2024. Synthetic publication.</li>
          <li id="smith-a">Smith 2024. Synthetic edition A.</li>
          <li id="smith-b">Smith 2024. Synthetic edition B.</li>
        </ul></section>
        <script>window.productionFixtureExecuted = true</script>
        <a href="#missing-target">Broken target</a>
      </main>`),
    ],
    [
      "/entries/synthetic-production/notes.html",
      html(
        `<main><a name="note-one"></a><h2>Notes</h2><p>Footnote 1. Publisher-authored synthetic note. <a href="supplement.html#legacy-supplement">Continue to the supplement</a>.</p></main>`,
      ),
    ],
    [
      "/entries/synthetic-production/supplement.html",
      html(
        `<main><a name="legacy-supplement"></a><h3><a id="legacy-supplement"></a>Historical supplement anchor</h3><p>Transitively discovered synthetic supplement.</p></main>`,
      ),
    ],
    [
      "/entries/synthetic-production/diagram-description.html",
      html(
        "<main><h2>Figure description</h2><p>A synthetic accessible description.</p></main>",
      ),
    ],
    ["/entries/synthetic-production/diagram.gif", image(productionAssetBytes)],
    [
      "/archives/sum2026/entries/synthetic-production/",
      html(
        '<main><a name="archive"></a><h2>Archived synthetic entry</h2></main>',
      ),
    ],
  ]);
}

export const structuralCorpus = {
  "actualism-current": `<main><nav id="toc"><a href="#actual">Actualism</a><a href="#modal-scope">Modal scope</a></nav><h2 id="actual">Actualism</h2><dl class="sentag"><dt>A.</dt><dd>Synthetic tagged content.</dd></dl><p><span data-tex="\\Box p"></span></p><h3 id="modal-scope">Modal scope</h3><p>Nested synthetic hierarchy.</p></main>`,
  "possible-worlds-notes": `<main><a name="worlds"></a><h2><a id="worlds"></a>Possible worlds</h2><p><a href="notes.html#footnote-one">Footnote 1</a></p></main>`,
  "plato-legacy-anchor": `<main><a name="forms"></a><h3>Forms</h3><p>Minimal historical hierarchy.</p></main>`,
  "diagrams-and-tables": `<main><h2 id="diagram">Diagram</h2><div class="figure"><img src="diagram.gif" alt="Synthetic diagram"><p>Figure 1: Synthetic.</p></div><table><caption>Relations</caption><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><table><tr><td>Layout</td><td>only</td></tr></table></main>`,
  "dense-notes-bibliography": `<main><h2 id="notes">Notes</h2><p><a id="footnote-one"></a>Footnote 1. Synthetic publisher note.</p><section id="bibliography"><h2>Bibliography</h2><ul><li id="one-a">One 2020. A.</li><li id="one-b">One 2020. B.</li></ul></section></main>`,
  malformed: `<main><h2 id="safe">Safe</h2><p onclick="alert(1)">Retained prose<script>window.fixturePwned=true</script><a href="#missing">Missing`,
  "archive-aware": `<main><a name="archive"></a><h2>Archived synthetic entry</h2></main>`,
} as const;
