import { useLayoutEffect, useRef } from "react";
import type { ReadingNavigation } from "../../navigation/model";
import type { ReadingScrollOwner } from "../../navigation/observations";
import type { ReadingSceneScrollOwner } from "../../navigation/sceneTopology";
import type { ReadingToolTab } from "../../tools/components/Panel";

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
  navigation: ReadingNavigation,
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
    if (owner === "publisher-note") return;
    const scrollTop = locations.current.read(owner);
    const saveLocation = () =>
      locations.current.save(owner, container.scrollTop);
    const handle = navigation.request({
      cause: "preserved-scroll",
      owner,
      target: `scroll-top:${scrollTop}`,
    });
    container.addEventListener("scroll", saveLocation, { passive: true });
    const frame = requestAnimationFrame(() =>
      handle.commit({
        kind: "position",
        scrollContainer: container,
        top: scrollTop,
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      handle.cancel();
      container.removeEventListener("scroll", saveLocation);
    };
  }, [navigation, owner, scrollContainerRef]);

  return () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    locations.current.save(owner, container.scrollTop);
  };
}
