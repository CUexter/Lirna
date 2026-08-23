import type { ReadingSemanticLocation } from "./reading-semantic-location";

const historyPositionsKey = "lirnaReadingPositions";
const historyNavigationPositionsKey = "lirnaReadingNavigationPositions";
const historySemanticPositionsKey = "lirnaReadingSemanticPositions";

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
    historyNavigationScrollTop(key) ??
    stateScrollTop(state[historyPositionsKey], key)
  );
}

export function saveReadingHistoryScrollTop(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
  scrollTop: number,
) {
  const key = historyPositionKey(sourceId, stateId, componentIdentity);
  writeNavigationScrollTop(key, scrollTop);
}

export function writeReadingHistoryPosition(
  key: string,
  scrollTop: number,
  semanticLocation: ReadingSemanticLocation,
) {
  const state = historyState();
  const positions = objectState(state[historyPositionsKey]);
  const semanticPositions = objectState(state[historySemanticPositionsKey]);
  window.history.replaceState(
    {
      ...state,
      __hashScrollIntoViewOptions: false,
      [historyPositionsKey]: { ...positions, [key]: scrollTop },
      [historySemanticPositionsKey]: {
        ...semanticPositions,
        [key]: semanticLocation,
      },
    },
    "",
  );
}

function historyNavigationScrollTop(key: string) {
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  const snapshot = state[historyNavigationPositionsKey];
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const { href, positions } = snapshot as {
    href?: unknown;
    positions?: unknown;
  };
  if (href !== window.location.href) return undefined;
  return stateScrollTop(positions, key);
}

function stateScrollTop(positions: unknown, key: string) {
  if (!positions || typeof positions !== "object") return undefined;
  const scrollTop = (positions as Record<string, unknown>)[key];
  return typeof scrollTop === "number" && Number.isFinite(scrollTop)
    ? Math.max(0, scrollTop)
    : undefined;
}

function writeNavigationScrollTop(key: string, scrollTop: number) {
  const state = historyState();
  const current = state[historyNavigationPositionsKey];
  const positions =
    current &&
    typeof current === "object" &&
    (current as { href?: unknown }).href === window.location.href
      ? (current as { positions?: Record<string, number> }).positions
      : undefined;
  window.history.replaceState(
    {
      ...state,
      [historyNavigationPositionsKey]: {
        href: window.location.href,
        positions: { ...positions, [key]: scrollTop },
      },
    },
    "",
  );
}

function historyState(): Record<string, unknown> {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : {};
}

function objectState(value: unknown): object {
  return value && typeof value === "object" ? value : {};
}
