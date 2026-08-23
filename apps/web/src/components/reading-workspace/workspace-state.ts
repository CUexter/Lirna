import { useLayoutEffect, useRef } from "react";

import { highlightTarget } from "./authored-navigation";
import type { SepReadingData } from "./content";
import { saveReadingHistoryScrollTop } from "./reading-resume";

export function useComponentTree(
  reading: SepReadingData,
  selectedComponent: string | undefined,
) {
  const component = selectedComponent
    ? reading.components.find((item) => item.identity === selectedComponent)
    : (reading.components.find(
        (item) => item.identity === reading.mainComponent.identity,
      ) ?? reading.components[0]);
  const parent = component
    ? reading.components.find(
        (item) => item.identity === component.parentIdentity,
      )
    : undefined;
  const siblings = component
    ? reading.components.filter(
        (item) => item.parentIdentity === component.parentIdentity,
      )
    : [];
  const siblingIndex = component
    ? siblings.findIndex((item) => item.identity === component.identity)
    : -1;
  const previous = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const next =
    siblingIndex >= 0 && siblingIndex < siblings.length - 1
      ? siblings[siblingIndex + 1]
      : undefined;
  return { component, parent, previous, next };
}

export function usePreservedScroll() {
  const scrollTop = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (scrollTop.current === undefined) return;
    window.scrollTo({ top: scrollTop.current });
    scrollTop.current = undefined;
  });
  return () => {
    scrollTop.current = window.scrollY;
  };
}

export function useScrollRestore({
  component,
  sourceId,
  stateId,
  onViewChange,
}: {
  component: SepReadingData["components"][number] | undefined;
  sourceId: string;
  stateId: string;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
}) {
  const locations = useRef(new Map<string, number>());
  const ephemeralScrollTop = component
    ? locations.current.get(component.identity)
    : undefined;

  const saveLocation = () => {
    if (!component) return;
    locations.current.set(component.identity, window.scrollY);
    saveReadingHistoryScrollTop(
      sourceId,
      stateId,
      component.identity,
      window.scrollY,
    );
  };
  const openBibliography = (entryId: string | undefined) => {
    onViewChange("bibliography", entryId);
  };
  const returnToCitation = (mentionId: string) => {
    const citation = document.getElementById(mentionId);
    citation?.scrollIntoView({ block: "center" });
    if (citation) highlightTarget(citation);
  };
  return {
    ephemeralScrollTop,
    openBibliography,
    returnToCitation,
    saveLocation,
  };
}
