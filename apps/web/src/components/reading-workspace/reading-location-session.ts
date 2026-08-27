import type { RefObject } from "react";

import type { ReadingDerivative } from "./content";
import { usePublisherNoteProgress } from "./publisher-note-progress";
import type { ReadingNavigation } from "./reading-navigation";
import { useReadingResume } from "./reading-resume";
import type { ReadingToolTab } from "./reading-tools-panel";
import { useScrollRestore } from "./workspace-state";
import type { ReadingView } from "./workspace-types";

type ReadingComponent = ReadingDerivative["components"][number];

export function useReadingLocationSession({
  article,
  navigation,
  onViewChange,
  publisherNote,
  target,
}: {
  article: {
    component: ReadingComponent;
    ref: RefObject<HTMLElement | null>;
  };
  navigation: ReadingNavigation;
  onViewChange: (view: ReadingView, citation?: string) => void;
  publisherNote: {
    activeTab: ReadingToolTab;
    component?: ReadingComponent;
    ref: RefObject<HTMLDivElement | null>;
    selectedReference: boolean;
  };
  target: { sourceId: string; stateId: string };
}) {
  usePublisherNoteProgress({
    active:
      publisherNote.activeTab === "supplementary" &&
      Boolean(publisherNote.component) &&
      !publisherNote.selectedReference,
    component: publisherNote.component,
    navigation,
    scrollContainerRef: publisherNote.ref,
    sourceId: target.sourceId,
    stateId: target.stateId,
  });
  const transitions = useScrollRestore({
    articleRef: article.ref,
    component: article.component,
    navigation,
    onViewChange,
    sourceId: target.sourceId,
    stateId: target.stateId,
  });
  const resumeStatus = useReadingResume({
    articleRef: article.ref,
    component: article.component,
    navigation,
    sourceId: target.sourceId,
    stateId: target.stateId,
  });
  return { ...transitions, resumeStatus };
}
