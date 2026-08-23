import { type RefObject, useEffect } from "react";

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
      if (
        handle.commit({
          kind: "target",
          scrollContainer,
          target: entry,
        })
      ) {
        entry.focus({ preventScroll: true });
      }
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
