import { expect, test } from "bun:test";
import { createReferenceIndex } from "../bibliography/components/References";
import { readingFixture } from "../test-support/fixtures";
import { createWorkspaceAuthoredNavigation } from "./authored";
import { createReadingNavigation } from "./model";
import { createReadingSceneTopology } from "./sceneTopology";
import {
  createWorkspaceSceneTransitions,
  type WorkspaceTransitionUnavailable,
} from "./sceneTransitions";

test("keeps unavailable publisher-authored movement behind the transition seam", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  const notes = reading.components.find(
    (component) => component.identity === "notes",
  );
  if (!(article && notes)) throw new Error("Reading fixture is incomplete");
  const topology = createReadingSceneTopology(reading);
  topology.unavailableSceneIdentities = [notes.identity];
  let selectedComponent: string | undefined;
  let unavailable: WorkspaceTransitionUnavailable | undefined;
  const navigation = createReadingNavigation();
  const transitions = createWorkspaceSceneTransitions({
    clearPendingTargets: () => undefined,
    componentIdentity: article.identity,
    hasUnsavedAnnotation: () => false,
    navigation,
    onAnnotationDiscardRequired: () => undefined,
    onComponentChange: (identity) => {
      selectedComponent = identity;
    },
    onUnavailable: (next) => {
      unavailable = next;
    },
    onViewChange: () => undefined,
    openBibliography: () => undefined,
    requestCitationScroll: () => undefined,
    returnToCitation: () => undefined,
    saveLocation: () => undefined,
    setEditingAnnotationId: () => undefined,
    setNotesIdentity: () => undefined,
    setPendingCitation: () => undefined,
    setPendingSceneFragment: () => undefined,
    setReadingToolTab: () => undefined,
    setSelectedReference: () => undefined,
    topology,
    view: "article",
  });
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation,
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: transitions.request,
    toolsScrollRef: { current: null },
  });

  expect(authoredNavigation.open(article, "notes.html#1", "Note 1")).toBe(true);
  expect(selectedComponent).toBeUndefined();
  expect(unavailable).toEqual({ reason: "scene-unavailable", target: "Notes" });
});
