import type { ReadingSemanticLocation } from "./reading-semantic-location";

const legacyHistoryPositionsKey = "lirnaReadingPositions";
const legacyHistoryNavigationPositionsKey = "lirnaReadingNavigationPositions";
const legacyHistorySemanticPositionsKey = "lirnaReadingSemanticPositions";
const historyLocationsKey = "lirnaReadingLocations";

export function historyPositionKey(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
) {
  return JSON.stringify([sourceId, stateId, componentIdentity]);
}

export function historyScrollTop(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
) {
  const key = historyPositionKey(sourceId, stateId, componentIdentity);
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  return (
    historyLocation(state, key)?.fallback.scrollTop ??
    legacyNavigationScrollTop(state, key) ??
    stateScrollTop(state[legacyHistoryPositionsKey], key)
  );
}

export function historySemanticLocation(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
) {
  const key = historyPositionKey(sourceId, stateId, componentIdentity);
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  const current = historyLocation(state, key);
  if (current) return current;
  const positions = state[legacyHistorySemanticPositionsKey];
  if (!positions || typeof positions !== "object") return undefined;
  const location = (positions as Record<string, unknown>)[key];
  return location && typeof location === "object"
    ? (location as ReadingSemanticLocation)
    : undefined;
}

export function writeReadingHistoryPosition(
  key: string,
  semanticLocation: ReadingSemanticLocation,
) {
  const state = historyState();
  const locations = objectState(state[historyLocationsKey]);
  window.history.replaceState(
    {
      ...state,
      [historyLocationsKey]: { ...locations, [key]: semanticLocation },
    },
    "",
  );
}

function historyLocation(state: Record<string, unknown>, key: string) {
  const locations = state[historyLocationsKey];
  if (!locations || typeof locations !== "object") return undefined;
  const location = (locations as Record<string, unknown>)[key];
  return location && typeof location === "object"
    ? (location as ReadingSemanticLocation)
    : undefined;
}

function legacyNavigationScrollTop(
  state: Record<string, unknown>,
  key: string,
) {
  const snapshot = state[legacyHistoryNavigationPositionsKey];
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const { href, positions } = snapshot as {
    href?: unknown;
    positions?: unknown;
  };
  return href === window.location.href
    ? stateScrollTop(positions, key)
    : undefined;
}

function stateScrollTop(positions: unknown, key: string) {
  if (!positions || typeof positions !== "object") return undefined;
  const scrollTop = (positions as Record<string, unknown>)[key];
  return typeof scrollTop === "number" && Number.isFinite(scrollTop)
    ? Math.max(0, scrollTop)
    : undefined;
}

function historyState(): Record<string, unknown> {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : {};
}

function objectState(value: unknown): object {
  return value && typeof value === "object" ? value : {};
}
