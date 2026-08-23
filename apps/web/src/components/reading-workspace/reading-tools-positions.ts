import { useLayoutEffect, useRef } from "react";

import type { ReadingScrollOwner } from "./navigation-observations";
import type { ReadingSceneScrollOwner } from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";

export function readingToolsScrollOwner({
  activeTab,
  hasSelectedReference,
  publisherNotesOwner,
}: {
  activeTab: ReadingToolTab;
  hasSelectedReference?: boolean;
  publisherNotesOwner?: ReadingSceneScrollOwner;
}): ReadingScrollOwner {
  if (
    activeTab === "supplementary" &&
    publisherNotesOwner &&
    !hasSelectedReference
  )
    return publisherNotesOwner;
  return `reading-tools:${activeTab}`;
}

export function createReadingToolsLocations() {
  const positions = new Map<ReadingScrollOwner, number>();
  return {
    read(owner: ReadingScrollOwner) {
      return positions.get(owner) ?? 0;
    },
    save(owner: ReadingScrollOwner, scrollTop: number) {
      positions.set(owner, scrollTop);
    },
  };
}

export function useReadingToolsLocation(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  {
    activeTab,
    hasSelectedReference,
    publisherNotesOwner,
  }: {
    activeTab: ReadingToolTab;
    hasSelectedReference?: boolean;
    publisherNotesOwner?: ReadingSceneScrollOwner;
  },
) {
  const locations = useRef(createReadingToolsLocations());
  const owner = readingToolsScrollOwner({
    activeTab,
    hasSelectedReference,
    publisherNotesOwner,
  });

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.dataset.readingScrollOwner = owner;
    const scrollTop = locations.current.read(owner);
    const saveLocation = () =>
      locations.current.save(owner, container.scrollTop);
    container.scrollTo({ top: scrollTop });
    container.addEventListener("scroll", saveLocation, { passive: true });
    const frame = requestAnimationFrame(() =>
      container.scrollTo({ top: scrollTop }),
    );
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", saveLocation);
    };
  }, [owner, scrollContainerRef]);

  return () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    locations.current.save(owner, container.scrollTop);
  };
}
