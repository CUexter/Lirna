import { beforeEach, expect, test } from "bun:test";

import {
  historyPositionKey,
  historyScrollTop,
  historySemanticLocation,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import type { ReadingSemanticLocation } from "./reading-semantic-location";

beforeEach(() => window.history.replaceState({ retained: true }, ""));

test("writes one semantic history location with its migration fallback", () => {
  const key = historyPositionKey("source", "state", "article");
  const semanticLocation = location(240);
  writeReadingHistoryPosition(key, semanticLocation);

  expect(window.history.state).toMatchObject({
    retained: true,
    lirnaReadingLocations: { [key]: semanticLocation },
  });
  expect(historyScrollTop("source", "state", "article")).toBe(240);
});

test("keeps legacy pixel-only history readable without writing it", () => {
  const key = historyPositionKey("source", "state", "article");
  window.history.replaceState({ lirnaReadingPositions: { [key]: 360 } }, "");

  expect(historyScrollTop("source", "state", "article")).toBe(360);
});

test("reads a publisher-note semantic location by its scene identity", () => {
  const key = historyPositionKey("source", "state", "notes-two");
  const semanticLocation = {
    ...location(480),
    scene: {
      identity: "notes-two",
      componentIdentity: "notes-two",
      owner: "publisher-note" as const,
    },
  };
  writeReadingHistoryPosition(key, semanticLocation);

  expect(historySemanticLocation("source", "state", "notes-two")).toEqual(
    semanticLocation,
  );
  expect(
    historySemanticLocation("source", "state", "notes-one"),
  ).toBeUndefined();
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
