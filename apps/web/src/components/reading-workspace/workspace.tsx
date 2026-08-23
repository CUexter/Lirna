// biome-ignore lint/style/noExcessiveLinesPerFile: This hook composes the owner-scoped workspace dependencies.
import { useRef, useState } from "react";

import {
  createReferenceJumper,
  scrollToPendingFragment,
} from "./authored-navigation";
import { useCitationOpening } from "./citation-opening";
import { ComponentUnavailable } from "./component-unavailable";
import type { SepReadingData } from "./content";
import { useReadingNavigationObservations } from "./navigation-observer";
import { usePublisherNoteProgress } from "./publisher-note-progress";
import {
  useExplicitFragmentNavigation,
  useReadingNavigationScope,
  useSceneFragmentNavigation,
} from "./reading-navigation-hooks";
import { useReadingResume } from "./reading-resume";
import {
  createReadingSceneTopology,
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";
import { ReadingWorkspaceView } from "./reading-workspace-view";
import { createReferenceIndex, type ReadingReference } from "./references";
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
  useComponentTree,
  usePendingCitationReturn,
  useScrollRestore,
} from "./workspace-state";

export type { SepReadingData };

export function SepReadingWorkspace({
  reading,
  initialFragment,
  selectedComponent,
  view,
  selectedCitation,
  onComponentChange,
  onFragmentChange,
  onViewChange,
}: {
  reading: SepReadingData;
  initialFragment?: string;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
}) {
  const topology = createReadingSceneTopology(reading);
  const { component, parent, previous, next, publisherNoteIdentity } =
    useComponentTree(reading, selectedComponent, topology);
  if (!component) {
    return (
      <ComponentUnavailable
        componentIdentity={selectedComponent}
        mainComponentIdentity={reading.mainComponent.identity}
        onComponentChange={onComponentChange}
      />
    );
  }
  return (
    <AvailableReadingWorkspace
      initialFragment={initialFragment}
      onComponentChange={onComponentChange}
      onFragmentChange={onFragmentChange}
      onViewChange={onViewChange}
      reading={reading}
      selectedCitation={selectedCitation}
      tree={{
        component,
        next,
        parent,
        previous,
        publisherNoteIdentity,
        topology,
      }}
      view={view}
    />
  );
}

type AvailableReadingWorkspaceProps = {
  initialFragment?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  reading: SepReadingData;
  selectedCitation?: string;
  tree: {
    component: SepReadingData["components"][number];
    next?: SepReadingData["components"][number];
    parent?: SepReadingData["components"][number];
    previous?: SepReadingData["components"][number];
    publisherNoteIdentity?: string;
    topology: ReadingSceneTopology;
  };
  view: "article" | "bibliography";
};

function AvailableReadingWorkspace(props: AvailableReadingWorkspaceProps) {
  return <ReadingWorkspaceView {...useReadingWorkspaceViewProps(props)} />;
}

// fallow-ignore-next-line complexity
function useReadingWorkspaceViewProps({
  initialFragment,
  onComponentChange,
  onFragmentChange,
  onViewChange,
  reading,
  selectedCitation,
  tree: {
    component,
    next,
    parent,
    previous,
    publisherNoteIdentity: initialPublisherNoteIdentity,
    topology,
  },
  view,
}: AvailableReadingWorkspaceProps): React.ComponentProps<
  typeof ReadingWorkspaceView
> {
  const { capture, source } = reading;
  const { articleRef, navigation, toolsScrollRef } =
    useReadingNavigationScope();
  const pendingSceneFragment = useRef<
    | {
        fragment: string;
        owner: "article" | "publisher-note";
        sceneIdentity: string;
        target: string;
      }
    | undefined
  >(undefined);
  const pendingCitation = useRef<
    | {
        componentIdentity: string;
        mentionId: string;
        owner: "article" | "publisher-note";
      }
    | undefined
  >(undefined);
  const [notesIdentity, setNotesIdentity] = useState<string | undefined>(
    initialPublisherNoteIdentity,
  );
  const [selectedReference, setSelectedReference] =
    useState<ReadingReference>();
  const [editingAnnotationId, setEditingAnnotationId] = useState<string>();
  const [readingToolTab, setReadingToolTab] = useState<ReadingToolTab>(
    view === "bibliography"
      ? "bibliography"
      : initialPublisherNoteIdentity
        ? "supplementary"
        : "contents",
  );
  const [citationScrollRequest, setCitationScrollRequest] = useState(0);

  const activateFragment = useExplicitFragmentNavigation({
    componentIdentity: component.identity,
    fragment: initialFragment,
    navigation,
    onFragmentChange,
  });

  const notes = reading.components.find(
    (item) => item.identity === notesIdentity,
  );
  const notesDestination = notes
    ? resolveReadingSceneDestination(topology, {
        sceneIdentity: notes.identity,
        target: "component",
      })
    : undefined;
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
  const navigateAuthoredScene = ({
    destination,
    from,
    fragment,
  }: Parameters<
    Parameters<typeof createAuthoredLinkHandler>[0]["navigateScene"]
  >[0]) => {
    const fromDestination = resolveReadingSceneDestination(topology, {
      sceneIdentity: from.identity,
      target: "component",
    });
    if (fromDestination.movement === "none") return false;
    const queueFragment = () => {
      if (!fragment) return;
      pendingSceneFragment.current = {
        fragment,
        owner: destination.owner,
        sceneIdentity: destination.scene.componentIdentity,
        target: destination.target,
      };
    };
    if (destination.scene.presentationRegion === "article") {
      if (destination.scene.componentIdentity === component.identity) {
        if (!fragment) return true;
        const pending = { current: fragment };
        scrollToPendingFragment(pending, {
          cause: "pending-fragment",
          highlight: true,
          navigation,
          target: destination.target,
          targetRoot: articleRef,
        });
        return true;
      }
      return navigation
        .request({
          cause: "component-transition",
          owner: destination.owner,
          target: destination.target,
        })
        .commitTransition(() => {
          queueFragment();
          if (fromDestination.owner === "publisher-note") {
            changeArticleScene(destination.scene.componentIdentity, true);
            return;
          }
          changeArticleScene(destination.scene.componentIdentity);
        });
    }
    const notesAlreadyOpen =
      notesIdentity === destination.scene.componentIdentity;
    return navigation
      .request({
        cause: "publisher-note-navigation",
        owner: destination.owner,
        target: destination.target,
      })
      .commitTransition(() => {
        saveLocation();
        setReadingToolTab("supplementary");
        if (view === "bibliography") onViewChange("article");
        setNotesIdentity(destination.scene.componentIdentity);
        if (!fragment) return;
        if (!notesAlreadyOpen) {
          queueFragment();
          return;
        }
        const pending = { current: fragment };
        scrollToPendingFragment(pending, {
          cause: "pending-fragment",
          container: toolsScrollRef,
          highlight: true,
          navigation,
          target: destination.target,
          targetRoot: toolsScrollRef,
        });
      });
  };
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
  const { citationComponentIdentity, openCitationFrom, openCurrentCitation } =
    useCitationOpening(
      component,
      reading.components,
      reading.mainComponent.identity,
      openCitation,
    );
  useReadingNavigationObservations({
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    selectedCitation,
    selectedCitationComponentIdentity: citationComponentIdentity,
    selectedReference,
    toolsScrollRef,
    view,
  });
  const handleReadingToolTabChange = createReadingToolTabChangeHandler({
    onViewChange,
    saveLocation,
    setReadingToolTab,
    view,
  });
  const returnToCitationTarget = (
    mentionId: string,
    targetComponentIdentity: string,
  ) => {
    const destination = resolveReadingSceneDestination(topology, {
      sceneIdentity: targetComponentIdentity,
      target: `citation:${mentionId}`,
    });
    if (destination.movement === "none") return;
    if (destination.owner === "publisher-note") {
      pendingCitation.current = {
        componentIdentity: targetComponentIdentity,
        mentionId,
        owner: destination.owner,
      };
      saveLocation();
      setReadingToolTab("supplementary");
      if (view === "bibliography") onViewChange("article");
      setNotesIdentity(destination.scene.componentIdentity);
      return;
    }
    if (targetComponentIdentity === component.identity) {
      returnToCitation(mentionId);
      onViewChange("article");
      return;
    }
    pendingCitation.current = {
      componentIdentity: targetComponentIdentity,
      mentionId,
      owner: destination.owner,
    };
    handleComponentChange(targetComponentIdentity);
  };
  const clearEditingAnnotation = createClearEditingAnnotationHandler(
    setEditingAnnotationId,
  );
  const openCurrentAuthoredLink = createCurrentAuthoredLinkHandler(
    component,
    openAuthoredLink,
  );
  return {
    articlePaneProps: {
      annotations: {
        editingId: editingAnnotationId,
        navigation,
        onEditHandled: clearEditingAnnotation,
        view,
      },
      articleRef,
      capture,
      component,
      contentActions: {
        onOpenAuthoredLink: openCurrentAuthoredLink,
        onOpenCitation: openCurrentCitation,
        onJumpReference: jumpToReference,
        onOpenReference: openReference,
        referenceIndex,
      },
      navigation: {
        mainComponentIdentity: reading.mainComponent.identity,
        next,
        onComponentChange: navigateComponentScene,
        parent,
        previous,
      },
      resumeStatus,
      source,
    },
    readingToolsProps: {
      bibliography: {
        citationScrollRequest,
        mainComponentIdentity: reading.mainComponent.identity,
        navigation,
        onReturnCitation: returnToCitationTarget,
        selectedComponentIdentity: citationComponentIdentity,
        selectedEntry: selectedCitationForView(view, selectedCitation),
      },
      component,
      components: reading.components,
      topology,
      navigation: {
        activeTab: activeToolTab,
        onActiveTabChange: handleReadingToolTabChange,
        onComponentChange: navigateComponentScene,
      },
      notes: {
        onOpenAnnotation: setEditingAnnotationId,
        sourceId: source.id,
        stateId: source.stateId,
      },
      scrollContainerRef: toolsScrollRef,
      supplementary: {
        onJumpReference: jumpToReference,
        onOpenAuthoredLink: openAuthoredLink,
        onOpenCitation: openCitationFrom,
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
