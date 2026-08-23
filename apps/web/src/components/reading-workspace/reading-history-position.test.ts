import { beforeEach, expect, test } from "bun:test";

import {
  historyPositionKey,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import type { ReadingSemanticLocation } from "./reading-semantic-location";

beforeEach(() => window.history.replaceState({ retained: true }, ""));

test("writes semantic and unchanged legacy pixels in one history update", () => {
  const key = historyPositionKey("source", "state", "article");
  const semanticLocation = location(240);
  writeReadingHistoryPosition(key, 240, semanticLocation);

  expect(window.history.state).toMatchObject({
    retained: true,
    lirnaReadingPositions: { [key]: 240 },
    lirnaReadingSemanticPositions: { [key]: semanticLocation },
  });
});

function location(scrollTop: number): ReadingSemanticLocation {
  return {
    version: 1,
    source: { sourceId: "source", stateId: "state" },
    scene: {
      identity: "article",
      componentIdentity: "article",
      owner: "article",
    },
    block: { identity: "content:block", strategy: "content-fingerprint" },
    progress: 0.5,
    fallback: {
      scrollTop,
      blockIndex: 1,
      blockTag: "p",
      textExcerpt: "Publication text",
      authoredAnchor: null,
    },
  };
}
