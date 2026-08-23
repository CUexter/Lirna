import { type RefObject, useEffect } from "react";

import {
  observeDirectReaderScroll,
  observeReadingNavigation,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import type { ReadingReference } from "./references";

export function useReadingNavigationObservations({
  componentIdentity,
  navigation,
  notesIdentity,
  selectedCitation,
  selectedReference,
  toolsScrollRef,
  view,
}: {
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  selectedCitation?: string;
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
      owner: "reading-tools",
      target: `#${selectedReference.targetId}`,
    });
  }, [selectedReference]);
  useEffect(() => {
    if (view !== "bibliography") return;
    observeReadingNavigation({
      cause: "bibliography-opening",
      owner: "reading-tools",
      target: selectedCitation ? `#${selectedCitation}` : "bibliography",
    });
  }, [selectedCitation, view]);
  useEffect(() => {
    if (!notesIdentity) return;
    observeReadingNavigation({
      cause: "publisher-note-navigation",
      owner: "reading-tools",
      target: `component:${notesIdentity}`,
    });
  }, [notesIdentity]);
}
