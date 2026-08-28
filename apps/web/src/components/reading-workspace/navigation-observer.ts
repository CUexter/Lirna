import { type RefObject, useEffect } from "react";

import {
  observeDirectReaderScroll,
  observeReadingNavigation,
  readingToolsOwnerFor,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import { type ReadingReference, referenceTarget } from "./references";

export function useReadingSceneNavigationObservations({
  componentIdentity,
  navigation,
  notesIdentity,
  selectedReference,
  toolsScrollRef,
}: {
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  selectedReference?: ReadingReference;
  toolsScrollRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(
    () =>
      observeDirectReaderScroll({
        onReaderControl: navigation.cancel,
        toolsScrollElement: toolsScrollRef.current,
      }),
    [navigation, toolsScrollRef],
  );
  useEffect(() => {
    observeReadingNavigation({
      cause: "component-transition",
      owner: "article",
      target: `component:${componentIdentity}`,
    });
  }, [componentIdentity]);
  useEffect(() => {
    if (!selectedReference) return;
    observeReadingNavigation({
      cause: "reference-opening",
      owner: readingToolsOwnerFor(toolsScrollRef.current),
      target: referenceTarget(selectedReference),
    });
  }, [selectedReference, toolsScrollRef]);
  useEffect(() => {
    if (!notesIdentity) return;
    observeReadingNavigation({
      cause: "publisher-note-navigation",
      owner: readingToolsOwnerFor(toolsScrollRef.current),
      target: `component:${notesIdentity}`,
    });
  }, [notesIdentity, toolsScrollRef]);
}
