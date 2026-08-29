import { useRef, useState } from "react";
import type { ReadingReference } from "../../bibliography/components/References";
import type { ReadingToolTab } from "../../tools/components/Panel";
import type {
  PendingCitation,
  PendingSceneFragment,
  ReadingView,
} from "../../types";
import type { PublisherAuthoredLink } from "../authored";
import { initialReadingToolTab } from "../sceneActions";
import type { WorkspaceTransitionUnavailable } from "../sceneTransitions";
import { useReadingNavigationScope } from "./useNavigation";

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
  const [pendingWorkspaceLeave, setPendingWorkspaceLeave] =
    useState<PublisherAuthoredLink>();
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
  const cancelWorkspaceLeave = () => setPendingWorkspaceLeave(undefined);
  const confirmWorkspaceLeave = () => {
    const link = pendingWorkspaceLeave;
    setPendingWorkspaceLeave(undefined);
    return link;
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
    workspaceLeave: {
      cancel: cancelWorkspaceLeave,
      confirm: confirmWorkspaceLeave,
      pending: pendingWorkspaceLeave,
      request: setPendingWorkspaceLeave,
    },
    toolsScrollRef,
  };
}
