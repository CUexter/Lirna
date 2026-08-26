import { beforeEach, expect, test } from "bun:test";

import {
  historyPositionKey,
  historyScrollTop,
  historySemanticLocation,
  removeReadingHistoryPosition,
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

test("removes one semantic history location without disturbing history state", () => {
  const key = historyPositionKey("source", "state", "article");
  writeReadingHistoryPosition(key, location(240));
  window.history.replaceState(
    {
      ...window.history.state,
      lirnaReadingPositions: { [key]: 120 },
      lirnaReadingSemanticPositions: { [key]: location(180) },
      lirnaReadingNavigationPositions: {
        href: window.location.href,
        positions: { [key]: 60 },
      },
    },
    "",
  );

  removeReadingHistoryPosition(key);

  expect(historySemanticLocation("source", "state", "article")).toBeUndefined();
  expect(historyScrollTop("source", "state", "article")).toBeUndefined();
  expect(window.history.state).toMatchObject({ retained: true });
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
