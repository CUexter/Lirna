import type { Dispatch, SetStateAction } from "react";

import type { SepReadingData } from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingReference } from "./references";
import {
  citationDestination,
  completeCitationNavigation,
} from "./workspace-navigation";
import type {
  PendingCitation,
  ReadingView,
  ReadingWorkspaceViewInput,
} from "./workspace-types";

type SetState<T> = Dispatch<SetStateAction<T>>;

export function initialReadingToolTab(
  view: ReadingView,
  initialNotesIdentity?: string,
): ReadingToolTab {
  if (view === "bibliography") return "bibliography";
  return initialNotesIdentity ? "supplementary" : "contents";
}

export function resolvePublisherNotes(
  reading: SepReadingData,
  notesIdentity: string | undefined,
  topology: ReadingSceneTopology,
) {
  const notes = reading.components.find(
    (item) => item.identity === notesIdentity,
  );
  const destination = notes
    ? resolveReadingSceneDestination(topology, {
        sceneIdentity: notes.identity,
        target: "component",
      })
    : undefined;
  return { notes, notesDestination: destination };
}

export function createComponentSceneNavigation([
  navigation,
  onComponentChange,
  onViewChange,
  saveLocation,
  setEditingAnnotationId,
  setNotesIdentity,
  setReadingToolTab,
  setSelectedReference,
  topology,
  view,
]: [
  navigation: ReadingNavigation,
  onComponentChange: (identity: string) => void,
  onViewChange: ReadingWorkspaceViewInput["onViewChange"],
  saveLocation: () => void,
  setEditingAnnotationId: SetState<string | undefined>,
  setNotesIdentity: SetState<string | undefined>,
  setReadingToolTab: SetState<ReadingToolTab>,
  setSelectedReference: SetState<ReadingReference | undefined>,
  topology: ReadingSceneTopology,
  view: ReadingView,
]) {
  const changeArticleScene = (
    identity: string,
    retainPublisherNotes = false,
  ) => {
    setEditingAnnotationId(undefined);
    if (!retainPublisherNotes) setNotesIdentity(undefined);
    setSelectedReference(undefined);
    saveLocation();
    onComponentChange(identity);
  };
  const navigateComponentScene = (identity: string) => {
    const destination = resolveReadingSceneDestination(topology, {
      sceneIdentity: identity,
      target: "component",
    });
    if (destination.movement === "none") return false;
    return navigation
      .request({
        cause: "component-transition",
        owner: destination.owner,
        target: destination.target,
      })
      .commitTransition(() => {
        if (destination.scene.presentationRegion === "article") {
          changeArticleScene(destination.scene.componentIdentity);
          return;
        }
        saveLocation();
        setReadingToolTab("supplementary");
        if (view === "bibliography") onViewChange("article");
        setNotesIdentity(destination.scene.componentIdentity);
      });
  };
  return { changeArticleScene, navigateComponentScene };
}

export function createCitationTargetReturn([
  componentIdentity,
  handleComponentChange,
  onViewChange,
  pendingCitation,
  returnToCitation,
  saveLocation,
  setNotesIdentity,
  setReadingToolTab,
  topology,
  view,
]: [
  componentIdentity: string,
  handleComponentChange: (identity: string) => void,
  onViewChange: ReadingWorkspaceViewInput["onViewChange"],
  pendingCitation: React.RefObject<PendingCitation | undefined>,
  returnToCitation: (mentionId: string) => void,
  saveLocation: () => void,
  setNotesIdentity: SetState<string | undefined>,
  setReadingToolTab: SetState<ReadingToolTab>,
  topology: ReadingSceneTopology,
  view: ReadingView,
]) {
  return (mentionId: string, targetComponentIdentity: string) =>
    completeCitationNavigation({
      destination: citationDestination(
        topology,
        componentIdentity,
        targetComponentIdentity,
        mentionId,
      ),
      handleComponentChange,
      mentionId,
      onPending: (owner) => {
        pendingCitation.current = {
          componentIdentity: targetComponentIdentity,
          mentionId,
          owner,
        };
      },
      onViewChange,
      preserveScroll: saveLocation,
      returnToCitation,
      setNotesIdentity,
      setReadingToolTab,
      targetComponentIdentity,
      view,
    });
}
