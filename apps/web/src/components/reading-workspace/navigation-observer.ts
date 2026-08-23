import { useEffect } from "react";

import {
  observeDirectReaderScroll,
  observeReadingNavigation,
} from "./navigation-observations";
import type { ReadingReference } from "./references";

export function useReadingNavigationObservations({
  componentIdentity,
  initialFragment,
  notesIdentity,
  selectedCitation,
  selectedReference,
  view,
}: {
  componentIdentity: string;
  initialFragment?: string;
  notesIdentity?: string;
  selectedCitation?: string;
  selectedReference?: ReadingReference;
  view: "article" | "bibliography";
}) {
  useEffect(() => observeDirectReaderScroll(), []);
  useEffect(() => {
    observeReadingNavigation({
      cause: "component-transition",
      owner: "article",
      target: `component:${componentIdentity}`,
    });
  }, [componentIdentity]);
  useEffect(() => {
    if (!initialFragment) return;
    observeReadingNavigation({
      cause: "explicit-fragment-arrival",
      owner: "article",
      target: `#${initialFragment}`,
    });
  }, [initialFragment]);
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
