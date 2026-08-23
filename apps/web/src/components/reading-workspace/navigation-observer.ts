import { type RefObject, useEffect } from "react";

import {
  observeDirectReaderScroll,
  observeReadingNavigation,
  readingToolsOwnerFor,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import { type ReadingReference, referenceTarget } from "./references";

export function useReadingNavigationObservations({
  componentIdentity,
  navigation,
  notesIdentity,
  selectedCitation,
  selectedCitationComponentIdentity,
  selectedReference,
  toolsScrollRef,
  view,
}: {
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  selectedCitation?: string;
  selectedCitationComponentIdentity?: string;
  selectedReference?: ReadingReference;
  toolsScrollRef: RefObject<HTMLDivElement | null>;
  view: "article" | "bibliography";
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
    if (view !== "bibliography") return;
    observeReadingNavigation({
      cause: "bibliography-opening",
      owner: readingToolsOwnerFor(toolsScrollRef.current),
      target: selectedCitation
        ? `bibliography:${selectedCitationComponentIdentity ?? componentIdentity}:${selectedCitation}`
        : "bibliography",
    });
  }, [
    componentIdentity,
    selectedCitation,
    selectedCitationComponentIdentity,
    toolsScrollRef,
    view,
  ]);
  useEffect(() => {
    if (!notesIdentity) return;
    observeReadingNavigation({
      cause: "publisher-note-navigation",
      owner: readingToolsOwnerFor(toolsScrollRef.current),
      target: `component:${notesIdentity}`,
    });
  }, [notesIdentity, toolsScrollRef]);
}
