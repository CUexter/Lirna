// biome-ignore lint/style/noExcessiveLinesPerFile: This hook composes the owner-scoped workspace dependencies.
import { useRef, useState } from "react";

import { createReferenceJumper } from "./authored-navigation";
import { useCitationOpening } from "./citation-opening";
import { ComponentUnavailable } from "./component-unavailable";
import type { SepReadingData } from "./content";
import { useReadingNavigationObservations } from "./navigation-observer";
import {
  useExplicitFragmentNavigation,
  useReadingNavigationScope,
} from "./reading-navigation-hooks";
import { useReadingResume } from "./reading-resume";
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
  usePendingFragmentScroll,
} from "./workspace-controller";
import {
  useComponentTree,
  usePendingCitationReturn,
  usePreservedScroll,
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
  const { component, parent, previous, next } = useComponentTree(
    reading,
    selectedComponent,
  );
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
      tree={{ component, next, parent, previous }}
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
  tree: { component, next, parent, previous },
  view,
}: AvailableReadingWorkspaceProps): React.ComponentProps<
  typeof ReadingWorkspaceView
> {
  const { capture, source } = reading;
  const { articleRef, navigation, toolsScrollRef } =
    useReadingNavigationScope();
  const pendingFragment = useRef<string | undefined>(undefined);
  const pendingCitation = useRef<
    | {
        componentIdentity: string;
        mentionId: string;
        owner: "article" | "publisher-note";
      }
    | undefined
  >(undefined);
  const highlightPendingFragment = useRef(false);
  const [notesIdentity, setNotesIdentity] = useState<string>();
  const [selectedReference, setSelectedReference] =
    useState<ReadingReference>();
  const [editingAnnotationId, setEditingAnnotationId] = useState<string>();
  const [readingToolTab, setReadingToolTab] = useState<ReadingToolTab>(
    view === "bibliography" ? "bibliography" : "contents",
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
  const preserveScroll = usePreservedScroll();
  const {
    ephemeralScrollTop,
    openBibliography,
    returnToCitation,
    saveLocation,
  } = useScrollRestore({
    articleRef,
    component,
    navigation,
    sourceId: source.id,
    stateId: source.stateId,
    onViewChange,
  });

  const resumeStatus = useReadingResume({
    articleRef,
    component,
    ephemeralScrollTop,
    navigation,
    sourceId: source.id,
    stateId: source.stateId,
  });
  usePendingFragmentScroll({
    componentIdentity: component.identity,
    highlightPendingFragment,
    initialFragment: undefined,
    notesIdentity,
    pendingFragment,
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
    preserveScroll,
    setReadingToolTab,
    setSelectedReference,
    view,
  });
  const openAuthoredLink = createAuthoredLinkHandler({
    component,
    handleComponentChange,
    highlightPendingFragment,
    notesIdentity,
    onViewChange,
    openReference,
    pendingFragment,
    preserveScroll,
    reading,
    referenceIndex,
    setNotesIdentity,
    setReadingToolTab,
    setSelectedReference,
    toolsScrollRef,
    view,
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
    const targetComponent = reading.components.find(
      (candidate) => candidate.identity === targetComponentIdentity,
    );
    if (targetComponent?.role === "notes") {
      pendingCitation.current = {
        componentIdentity: targetComponentIdentity,
        mentionId,
        owner: "publisher-note",
      };
      preserveScroll();
      setReadingToolTab("supplementary");
      if (view === "bibliography") onViewChange("article");
      setNotesIdentity(targetComponent.identity);
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
      owner: "article",
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
        onComponentChange: handleComponentChange,
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
      navigation: {
        activeTab: activeReadingToolTab(view, readingToolTab),
        onActiveTabChange: handleReadingToolTabChange,
        onComponentChange: handleComponentChange,
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
        referenceIndex,
        selectedReference,
      },
    },
    onFragmentActivate: activateFragment,
  };
}
