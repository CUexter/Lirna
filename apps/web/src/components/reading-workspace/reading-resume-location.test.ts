import { describe, expect, test } from "bun:test";

import { resolveReadingResumeLocation } from "./reading-resume-location";
import type { ReadingSemanticLocation } from "./reading-semantic-location";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

describe("Reading resume location", () => {
  test("semantic content wins over a conflicting legacy pixel", () => {
    const root = scene(
      '<p><span id="target"></span>Stable passage</p>',
      300,
      200,
    );

    expect(
      resolveReadingResumeLocation({
        componentIdentity: "article",
        legacyScrollTop: 900,
        location: location("anchor:16f3e46051eee3e8"),
        owner: "article",
        root,
        scrollTop: 100,
        sourceId,
        stateId,
        viewportHeight: 400,
      }),
    ).toEqual({
      cause: "resume",
      scrollTop: 400,
      target: "semantic-block:anchor:16f3e46051eee3e8",
    });
  });

  test("uses an observable legacy fallback only when the semantic target fails", () => {
    const root = scene("<p>Changed passage</p>", 300, 200);

    expect(
      resolveReadingResumeLocation({
        componentIdentity: "article",
        legacyScrollTop: 900,
        location: location("content:missing:0"),
        owner: "article",
        root,
        scrollTop: 100,
        sourceId,
        stateId,
        viewportHeight: 400,
      }),
    ).toEqual({
      cause: "resume-legacy-fallback",
      scrollTop: 900,
      target: "legacy-scroll-top:900",
    });
  });
});

function location(blockIdentity: string): ReadingSemanticLocation {
  return {
    version: 1,
    source: { sourceId, stateId },
    scene: {
      identity: "article",
      componentIdentity: "article",
      owner: "article",
    },
    block: { identity: blockIdentity, strategy: "authored-anchor" },
    progress: 0.5,
    fallback: {
      scrollTop: 100,
      blockIndex: 0,
      blockTag: "p",
      textExcerpt: "Stable passage",
      authoredAnchor: "target",
    },
  };
}

function scene(markup: string, top: number, height: number) {
  const root = document.createElement("article");
  root.innerHTML = markup;
  const block = root.querySelector<HTMLElement>("p");
  if (!block) throw new Error("Fixture has no semantic block");
  block.getBoundingClientRect = () => ({
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  return root;
}
