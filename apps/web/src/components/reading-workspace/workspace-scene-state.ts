import { useRef, useState } from "react";

import { useReadingNavigationScope } from "./reading-navigation-hooks";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingReference } from "./references";
import { initialReadingToolTab } from "./workspace-scene-actions";
import type { WorkspaceTransitionUnavailable } from "./workspace-scene-transitions";
import type {
  PendingCitation,
  PendingSceneFragment,
  ReadingView,
} from "./workspace-types";

export function useWorkspaceSceneState(
  view: ReadingView,
  initialNotesIdentity?: string,
) {
  const { articleRef, navigation, toolsScrollRef } =
    useReadingNavigationScope();
  const pendingSceneFragment = useRef<PendingSceneFragment | undefined>(
    undefined,
  );
  const pendingCitation = useRef<PendingCitation | undefined>(undefined);
  const [notesIdentity, setNotesIdentity] = useState<string | undefined>(
    initialNotesIdentity,
  );
  const [selectedReference, setSelectedReference] =
    useState<ReadingReference>();
  const [editingAnnotationId, setEditingAnnotationId] = useState<string>();
  const [readingToolTab, setReadingToolTab] = useState<ReadingToolTab>(
    initialReadingToolTab(view, initialNotesIdentity),
  );
  const [citationScrollRequest, setCitationScrollRequest] = useState(0);
  const hasUnsavedAnnotation = useRef(false);
  const [pendingAnnotationDiscard, setPendingAnnotationDiscard] = useState<
    (() => void) | undefined
  >();
  const [transitionUnavailable, setTransitionUnavailable] =
    useState<WorkspaceTransitionUnavailable>();
  const cancelDiscard = () => setPendingAnnotationDiscard(undefined);
  const confirmDiscard = () => {
    const transition = pendingAnnotationDiscard;
    setPendingAnnotationDiscard(undefined);
    transition?.();
  };
  const hasUnsavedChanges = () => hasUnsavedAnnotation.current;
  const reportUnsavedChanges = (unsaved: boolean) => {
    hasUnsavedAnnotation.current = unsaved;
  };
  const clearPendingTargets = (owner: PendingCitation["owner"]) => {
    if (pendingCitation.current?.owner === owner) {
      pendingCitation.current = undefined;
    }
    if (pendingSceneFragment.current?.owner === owner) {
      pendingSceneFragment.current = undefined;
    }
  };
  const requestDiscard = (transition: () => void) => {
    setPendingAnnotationDiscard(() => transition);
  };
  return {
    articleRef,
    clearPendingTargets,
    citationScrollRequest,
    editingAnnotationId,
    navigation,
    notesIdentity,
    pendingCitation,
    pendingSceneFragment,
    pendingAnnotationDiscard,
    readingToolTab,
    selectedReference,
    setCitationScrollRequest,
    setEditingAnnotationId,
    setNotesIdentity,
    setReadingToolTab,
    setSelectedReference,
    setTransitionUnavailable,
    transitionUnavailable,
    annotationTransition: {
      cancelDiscard,
      confirmDiscard,
      hasUnsavedChanges,
      reportUnsavedChanges,
      requestDiscard,
    },
    toolsScrollRef,
  };
}
