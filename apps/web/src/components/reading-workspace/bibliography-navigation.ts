import { type RefObject, useEffect } from "react";

import { scrollTarget } from "./authored-navigation";
import type { ReadingNavigation } from "./reading-navigation";

export function useBibliographySelection({
  navigation,
  scrollContainerRef,
  selectedComponentIdentity,
  selectedEntry,
  selectedEntryRef,
  selectedEntryRequest,
}: {
  navigation: ReadingNavigation;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectedComponentIdentity: string;
  selectedEntry?: string;
  selectedEntryRef: RefObject<HTMLLIElement | null>;
  selectedEntryRequest?: string;
}) {
  useEffect(() => {
    const entry = selectedEntryRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!(selectedEntryRequest && entry && scrollContainer)) return;
    const target = `bibliography:${selectedComponentIdentity}:${selectedEntry}`;
    const handle = navigation.request({
      cause: "bibliography-selection",
      owner: "reading-tools:bibliography",
      target,
    });
    const frame = requestAnimationFrame(() => {
      if (!handle.active()) return;
      handle.commit(() => {
        scrollTarget(entry, scrollContainer, "bibliography-selection", target);
        entry.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    navigation,
    scrollContainerRef,
    selectedComponentIdentity,
    selectedEntry,
    selectedEntryRef,
    selectedEntryRequest,
  ]);
}
