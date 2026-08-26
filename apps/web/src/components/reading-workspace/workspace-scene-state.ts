import { useRef, useState } from "react";

import { useReadingNavigationScope } from "./reading-navigation-hooks";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingReference } from "./references";
import { initialReadingToolTab } from "./workspace-scene-actions";
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
  return {
    articleRef,
    citationScrollRequest,
    editingAnnotationId,
    navigation,
    notesIdentity,
    pendingCitation,
    pendingSceneFragment,
    readingToolTab,
    selectedReference,
    setCitationScrollRequest,
    setEditingAnnotationId,
    setNotesIdentity,
    setReadingToolTab,
    setSelectedReference,
    toolsScrollRef,
  };
}
