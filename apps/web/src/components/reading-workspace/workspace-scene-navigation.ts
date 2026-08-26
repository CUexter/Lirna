import { createReferenceJumper } from "./authored-navigation";
import { usePublisherNoteProgress } from "./publisher-note-progress";
import {
  useExplicitFragmentNavigation,
  useSceneFragmentNavigation,
} from "./reading-navigation-hooks";
import { useReadingResume } from "./reading-resume";
import { createReferenceIndex } from "./references";
import { createWorkspaceAuthoredSceneNavigator } from "./workspace-authored-scene-navigation";
import { useWorkspaceCitationResolution } from "./workspace-citation-resolution";
import {
  activeReadingToolTab,
  createAuthoredLinkHandler,
  createClearEditingAnnotationHandler,
  createComponentChangeHandler,
  createCurrentAuthoredLinkHandler,
  createOpenCitationHandler,
  createOpenReferenceHandler,
  createReadingToolTabChangeHandler,
  selectedCitationForView,
} from "./workspace-controller";
import {
  createCitationTargetReturn,
  createComponentSceneNavigation,
  resolvePublisherNotes,
} from "./workspace-scene-actions";
import { useWorkspaceSceneState } from "./workspace-scene-state";
import { usePendingCitationReturn, useScrollRestore } from "./workspace-state";
import type { ReadingWorkspaceViewInput } from "./workspace-types";

export function useReadingWorkspaceViewProps({
  initialFragment,
  onComponentChange,
  onFragmentChange,
  onViewChange,
  selectedCitation,
  tree,
  view,
  workspace: { citationResolutions, reading },
}: ReadingWorkspaceViewInput) {
  const {
    component,
    publisherNoteIdentity: initialNotesIdentity,
    topology,
  } = tree;
  const { source } = reading;
  const {
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
  } = useWorkspaceSceneState(view, initialNotesIdentity);
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
  usePublisherNoteProgress({
    active:
      activeToolTab === "supplementary" && Boolean(notes) && !selectedReference,
    component: notes,
    navigation,
    scrollContainerRef: toolsScrollRef,
    sourceId: source.id,
    stateId: source.stateId,
  });
  const { openBibliography, returnToCitation, saveLocation } = useScrollRestore(
    {
      articleRef,
      component,
      navigation,
      sourceId: source.id,
      stateId: source.stateId,
      onViewChange,
    },
  );
  const resumeStatus = useReadingResume({
    articleRef,
    component,
    navigation,
    sourceId: source.id,
    stateId: source.stateId,
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
    onPublisherNoteActivate: () => setSelectedReference(undefined),
    topology,
    toolsScrollRef,
  });
  const handleComponentChange = createComponentChangeHandler({
    onComponentChange,
    saveLocation,
    setEditingAnnotationId,
    setNotesIdentity,
    setSelectedReference,
  });
  const openReference = createOpenReferenceHandler({
    onViewChange,
    preserveScroll: saveLocation,
    setReadingToolTab,
    setSelectedReference,
    view,
  });
  const { changeArticleScene, navigateComponentScene } =
    createComponentSceneNavigation([
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
    ]);
  const navigateAuthoredScene = createWorkspaceAuthoredSceneNavigator([
    articleRef,
    changeArticleScene,
    component,
    navigation,
    notesIdentity,
    onViewChange,
    pendingSceneFragment,
    saveLocation,
    setNotesIdentity,
    setReadingToolTab,
    toolsScrollRef,
    topology,
    view,
  ]);
  const openAuthoredLink = createAuthoredLinkHandler({
    navigateScene: navigateAuthoredScene,
    openReference,
    reading,
    referenceIndex,
    setSelectedReference,
    topology,
  });
  const openCitation = createOpenCitationHandler({
    openBibliography,
    setCitationScrollRequest,
    setNotesIdentity,
    setReadingToolTab,
    setSelectedReference,
  });
  const returnToCitationTarget = createCitationTargetReturn([
    component.identity,
    handleComponentChange,
    onViewChange,
    pendingCitation,
    returnToCitation,
    saveLocation,
    setNotesIdentity,
    setReadingToolTab,
    topology,
    view,
  ]);
  const citation = useWorkspaceCitationResolution([
    articleRef,
    citationResolutions,
    component,
    handleComponentChange,
    navigation,
    notesIdentity,
    onViewChange,
    openCitation,
    reading,
    returnToCitationTarget,
    selectedCitation,
    selectedReference,
    toolsScrollRef,
    view,
  ]);
  return {
    articlePaneProps: {
      annotations: {
        editingId: editingAnnotationId,
        navigation,
        onEditHandled: createClearEditingAnnotationHandler(
          setEditingAnnotationId,
        ),
        view,
      },
      articleRef,
      capture: reading.capture,
      component,
      contentActions: {
        citationResolutions,
        onOpenAuthoredLink: createCurrentAuthoredLinkHandler(
          component,
          openAuthoredLink,
        ),
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
      resumeStatus,
      source: reading.source,
    },
    readingToolsProps: {
      bibliography: {
        citationScrollRequest,
        citationResolutions,
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
        onActiveTabChange: createReadingToolTabChangeHandler({
          onViewChange,
          saveLocation,
          setReadingToolTab,
          view,
        }),
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
        onOpenAuthoredLink: openAuthoredLink,
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
  };
}
