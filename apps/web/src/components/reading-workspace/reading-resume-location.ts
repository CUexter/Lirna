import type { ReadingNavigationCause } from "./navigation-observations";
import {
  type ReadingSemanticLocation,
  resolveReadingSemanticLocation,
} from "./reading-semantic-location";

export function resolveReadingResumeLocation({
  legacyScrollTop,
  location,
  ...semanticInput
}: {
  componentIdentity: string;
  legacyScrollTop: number;
  location?: ReadingSemanticLocation;
  owner: "article" | "publisher-note";
  root: HTMLElement | null;
  scrollTop: number;
  sourceId: string;
  stateId: string;
  viewportHeight: number;
  viewportTop?: number;
}): {
  cause: Extract<ReadingNavigationCause, "resume" | "resume-legacy-fallback">;
  scrollTop: number;
  target: string;
} {
  const semanticScrollTop = resolveReadingSemanticLocation({
    ...semanticInput,
    location,
  });
  if (semanticScrollTop !== undefined && location) {
    return {
      cause: "resume",
      scrollTop: semanticScrollTop,
      target: `semantic-block:${location.block.identity}`,
    };
  }
  const scrollTop = Math.max(0, Math.round(legacyScrollTop));
  return {
    cause: "resume-legacy-fallback",
    scrollTop,
    target: `legacy-scroll-top:${scrollTop}`,
  };
}
