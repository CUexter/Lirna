import { createWorkspaceAuthoredNavigation } from "./authored-navigation";
import { useReadingSceneNavigationObservations } from "./navigation-observer";
import { useReadingLocationSession } from "./reading-location-session";
import {
  useExplicitFragmentNavigation,
  useSceneFragmentNavigation,
} from "./reading-navigation-hooks";
import { createReferenceJumper } from "./reading-target-navigation";
import type { ReadingToolTab } from "./reading-tools-panel";
import { createReferenceIndex, type ReadingReference } from "./references";
import { useWorkspaceCitationResolution } from "./workspace-citation-resolution";
import {
  activeReadingToolTab,
  createClearEditingAnnotationHandler,
  selectedCitationForView,
} from "./workspace-controller";
import { resolvePublisherNotes } from "./workspace-scene-actions";
import { useWorkspaceSceneState } from "./workspace-scene-state";
import { createWorkspaceSceneTransitions } from "./workspace-scene-transitions";
import { usePendingCitationReturn } from "./workspace-state";
import type { ReadingWorkspaceViewInput } from "./workspace-types";

export function useReadingWorkspaceViewProps({
  initialFragment,
  onComponentChange,
  onFragmentChange,
  onWorkspaceLeave,
  onViewChange,
  selectedCitation,
  tree,
  view,
  model: { citationResolutions, evidenceAccess, reading, state },
}: ReadingWorkspaceViewInput) {
  const {
    component,
    publisherNoteIdentity: initialNotesIdentity,
    topology,
  } = tree;
  const { source } = reading;
  const {
    articleRef,
    annotationTransition,
    citationScrollRequest,
    clearPendingTargets,
    editingAnnotationId,
    navigation,
    notesIdentity,
    pendingCitation,
    pendingAnnotationDiscard,
    pendingSceneFragment,
    readingToolTab,
    selectedReference,
    setCitationScrollRequest,
    setEditingAnnotationId,
    setNotesIdentity,
    setReadingToolTab,
    setSelectedReference,
    setTransitionUnavailable,
    toolsScrollRef,
    transitionUnavailable,
    workspaceLeave,
  } = useWorkspaceSceneState(view, initialNotesIdentity);
  useReadingSceneNavigationObservations({
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    selectedReference,
    toolsScrollRef,
  });
  const activateFragment = useExplicitFragmentNavigation({
    componentIdentity: component.identity,
    fragment: initialFragment,
    navigation,
    onFragmentChange,
  });
  const { notes, notesDestination } = resolvePublisherNotes(
    reading,
    notesIdentity,
    topology,
  );
  const activeToolTab = activeReadingToolTab(view, readingToolTab);
  const location = useReadingLocationSession({
    article: { component, ref: articleRef },
    navigation,
    onViewChange,
    publisherNote: {
      activeTab: activeToolTab,
      component: notes,
      ref: toolsScrollRef,
      selectedReference: Boolean(selectedReference),
    },
    target: { sourceId: source.id, stateId: source.stateId },
  });
  const { openBibliography, returnToCitation, saveLocation } = location;
  const transitions = createWorkspaceSceneTransitions({
    clearPendingTargets,
    componentIdentity: component.identity,
    hasUnsavedAnnotation: annotationTransition.hasUnsavedChanges,
    navigation,
    onAnnotationDiscardRequired: annotationTransition.requestDiscard,
    onComponentChange,
    onUnavailable: setTransitionUnavailable,
    onViewChange,
    openBibliography,
    requestCitationScroll: () =>
      setCitationScrollRequest((request) => request + 1),
    returnToCitation,
    saveLocation,
    setEditingAnnotationId,
    setNotesIdentity,
    setPendingCitation: (pending) => {
      pendingCitation.current = pending;
    },
    setPendingSceneFragment: (pending) => {
      pendingSceneFragment.current = pending;
    },
    setReadingToolTab,
    setSelectedReference,
    topology,
    view,
  });
  const reportUnavailable = (targetDescription: string) =>
    transitions.request({
      kind: "unavailable",
      reason: "target-unavailable",
      targetDescription,
    });
  useSceneFragmentNavigation({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    pendingFragment: pendingSceneFragment,
    toolsScrollRef,
  });
  usePendingCitationReturn({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    pendingCitation,
    toolsScrollRef,
  });
  const referenceIndex = createReferenceIndex(component);
  const jumpToReference = createReferenceJumper({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    onUnavailable: reportUnavailable,
    onPublisherNoteActivate: () => setSelectedReference(undefined),
    topology,
    toolsScrollRef,
  });
  const navigateComponentScene = (identity: string) =>
    transitions.request({
      identity,
      kind: "component",
      originOwner: "article",
    });
  const openReference = (reference: ReadingReference) =>
    transitions.request({ kind: "reference", reference });
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef,
    component,
    navigation,
    notesIdentity,
    onLeaveReadingWorkspace: (link) => {
      setTransitionUnavailable(undefined);
      workspaceLeave.request(link);
    },
    reading,
    referenceIndex,
    requestTransition: transitions.request,
    toolsScrollRef,
  });
  const activeDerivative = state.derivatives.find(
    (derivative) => derivative.currentActivation,
  );
  if (!activeDerivative) {
    throw new Error("Reading workspace has no active Derivative");
  }
  const citation = useWorkspaceCitationResolution({
    evidenceAccess,
    reading: {
      citationResolutions,
      components: reading.components,
      mainComponentIdentity: reading.mainComponent.identity,
    },
    scene: {
      articleRef,
      component,
      navigation,
      selectedCitation,
      topology,
      toolsScrollRef,
      view,
    },
    requestTransition: transitions.request,
    target: {
      derivativeId: activeDerivative.id,
      sourceId: source.id,
      stateId: source.stateId,
    },
  });
  const projectedCitationResolutions = citation.citationResolutions;
  return {
    articlePaneProps: {
      annotations: {
        editingId: editingAnnotationId,
        navigation,
        onEditHandled: createClearEditingAnnotationHandler(
          setEditingAnnotationId,
        ),
        onUnsavedChange: annotationTransition.reportUnsavedChanges,
        view,
      },
      articleRef,
      capture: reading.capture,
      component,
      contentActions: {
        citationResolutions: projectedCitationResolutions,
        onOpenPublisherAuthoredLink: (href: string, label: string) =>
          authoredNavigation.open(component, href, label),
        onOpenCitation: citation.openCurrent,
        onOpenCitationResolution: citation.openManual,
        onJumpReference: jumpToReference,
        onOpenReference: openReference,
        referenceIndex,
      },
      navigation: {
        mainComponentIdentity: reading.mainComponent.identity,
        next: tree.next,
        onComponentChange: navigateComponentScene,
        parent: tree.parent,
        previous: tree.previous,
      },
      resumeStatus: location.resumeStatus,
      source: reading.source,
    },
    readingToolsProps: {
      bibliography: {
        citationScrollRequest,
        citationResolutions: projectedCitationResolutions,
        resolution: citation.resolution,
        mainComponentIdentity: reading.mainComponent.identity,
        navigation,
        onReturnCitation: citation.returnToMention,
        selectedComponentIdentity: citation.citationComponentIdentity,
        selectedEntry: selectedCitationForView(view, selectedCitation),
      },
      component,
      components: reading.components,
      topology,
      navigation: {
        activeTab: activeToolTab,
        onActiveTabChange: (tab: ReadingToolTab) =>
          transitions.request({ kind: "tool", tab }),
        onComponentChange: navigateComponentScene,
      },
      notes: {
        onOpenAnnotation: setEditingAnnotationId,
        sourceId: reading.source.id,
        stateId: reading.source.stateId,
      },
      scrollContainerRef: toolsScrollRef,
      supplementary: {
        onJumpReference: jumpToReference,
        onOpenPublisherAuthoredLink: authoredNavigation.open,
        onOpenCitation: citation.openFrom,
        onOpenReference: openReference,
        publisherNotes: notes,
        publisherNotesOwner:
          notesDestination?.movement === "move"
            ? notesDestination.owner
            : undefined,
        referenceIndex,
        selectedReference,
      },
    },
    onFragmentActivate: activateFragment,
    transitionFeedback: {
      annotationDiscard: {
        onCancel: annotationTransition.cancelDiscard,
        onConfirm: annotationTransition.confirmDiscard,
        open: Boolean(pendingAnnotationDiscard),
      },
      workspaceLeave: {
        link: workspaceLeave.pending,
        onCancel: workspaceLeave.cancel,
        onConfirm: () => {
          const link = workspaceLeave.confirm();
          if (!link) return;
          transitions.request({ kind: "workspace-leave" }, () =>
            onWorkspaceLeave(link.href),
          );
        },
        open: Boolean(workspaceLeave.pending),
      },
      unavailable: transitionUnavailable,
    },
  };
}
