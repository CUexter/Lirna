import { describe, expect, test } from "bun:test";

import {
  createReadingSemanticLocation,
  type ReadingSemanticLocation,
  resolveReadingSemanticLocation,
} from "./semanticLocation";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

describe("semantic Reading locations", () => {
  test("keeps content identity stable across rendering geometry changes", () => {
    const first = scene("<p>  Stable publication text </p>", [20, 100]);
    const second = scene(
      "<div><p>Stable publication text</p></div>",
      [80, 240],
    );

    const firstLocation = articleLocation(first, "article", 100);
    const secondLocation = articleLocation(second, "article", 260);

    expect(firstLocation.block).toEqual({
      identity: expect.stringMatching(/^content:/),
      strategy: "content-fingerprint",
    });
    expect(secondLocation.block).toEqual(firstLocation.block);
    expect(firstLocation.fallback.textExcerpt).toBe("Stable publication text");
  });

  test("uses authored anchors for publisher notes and bounds progress", () => {
    const root = scene(
      '<p><span id="note-4"></span>Publisher note</p>',
      [100, 200],
    );
    const location = createReadingSemanticLocation({
      componentIdentity: "notes",
      owner: "publisher-note",
      root,
      scrollTop: 400,
      sourceId,
      stateId,
      viewportHeight: 200,
      viewportTop: 250,
    });

    expect(location).toMatchObject({
      source: { sourceId, stateId },
      scene: {
        identity: "notes",
        componentIdentity: "notes",
        owner: "publisher-note",
      },
      block: { strategy: "authored-anchor" },
      progress: 1,
      fallback: {
        scrollTop: 400,
        blockIndex: 0,
        blockTag: "p",
        textExcerpt: "Publisher note",
        authoredAnchor: "note-4",
      },
    });
  });

  test("handles zero-height and missing blocks deterministically", () => {
    const zeroHeight = scene("<figure aria-label='Diagram'></figure>", [50, 0]);
    expect(articleLocation(zeroHeight, "supplement", 75)).toMatchObject({
      progress: 0,
      fallback: { blockTag: "figure" },
    });
    expect(
      articleLocation(document.createElement("article"), "empty", 75),
    ).toMatchObject({
      block: { strategy: "scene-fallback" },
      progress: 0,
      fallback: { blockIndex: 0, blockTag: "scene", textExcerpt: "" },
    });
  });

  test("resolves an authored publisher-note block in changed geometry", () => {
    const root = scene(
      '<p><span id="note-4"></span>Publisher note</p>',
      [300, 200],
    );
    const location: ReadingSemanticLocation = {
      version: 1,
      source: { sourceId, stateId },
      scene: {
        identity: "notes",
        componentIdentity: "notes",
        owner: "publisher-note",
      },
      block: {
        identity: "anchor:12244f3df7d4f46c",
        strategy: "authored-anchor",
      },
      progress: 0.5,
      fallback: {
        scrollTop: 900,
        blockIndex: 0,
        blockTag: "p",
        textExcerpt: "Publisher note",
        authoredAnchor: "note-4",
      },
    };

    expect(
      resolveReadingSemanticLocation({
        componentIdentity: "notes",
        location,
        owner: "publisher-note",
        root,
        scrollTop: 100,
        sourceId,
        stateId,
        viewportHeight: 400,
        viewportTop: 50,
      }),
    ).toBe(350);
  });

  test("rejects a semantic location owned by another scene", () => {
    const root = scene("<p>Publisher note</p>", [300, 200]);
    const location = createReadingSemanticLocation({
      componentIdentity: "other-notes",
      owner: "publisher-note",
      root,
      scrollTop: 100,
      sourceId,
      stateId,
      viewportHeight: 400,
    });

    expect(
      resolveReadingSemanticLocation({
        componentIdentity: "notes",
        location,
        owner: "publisher-note",
        root,
        scrollTop: 100,
        sourceId,
        stateId,
        viewportHeight: 400,
      }),
    ).toBeUndefined();
  });
});

function articleLocation(
  root: HTMLElement,
  componentIdentity: string,
  scrollTop: number,
) {
  return createReadingSemanticLocation({
    componentIdentity,
    owner: "article",
    root,
    scrollTop,
    sourceId,
    stateId,
    viewportHeight: 400,
  });
}

function scene(markup: string, [top, height]: [number, number]) {
  const root = document.createElement("article");
  root.innerHTML = markup;
  const block = root.querySelector<HTMLElement>(
    "h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside",
  );
  if (!block) throw new Error("Fixture has no semantic block");
  block.getBoundingClientRect = () => rect(top, height);
  return root;
}

function rect(top: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}
