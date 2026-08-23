import { buttonVariants } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useRef, useState } from "react";

import { createReferenceJumper } from "./authored-navigation";
import { ComponentUnavailable } from "./component-unavailable";
import type { SepReadingData } from "./content";
import { useReadingNavigationObservations } from "./navigation-observer";
import { ReadingArticlePane } from "./reading-article-pane";
import { useReadingResume } from "./reading-resume";
import { ReadingToolsPanel, type ReadingToolTab } from "./reading-tools-panel";
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
  createReturnToCitationHandler,
  selectedCitationForView,
  usePendingFragmentScroll,
} from "./workspace-controller";
import {
  useComponentTree,
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
  onViewChange,
}: {
  reading: SepReadingData;
  initialFragment?: string;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  onComponentChange: (identity: string) => void;
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

function useReadingWorkspaceViewProps({
  initialFragment,
  onComponentChange,
  onViewChange,
  reading,
  selectedCitation,
  tree: { component, next, parent, previous },
  view,
}: AvailableReadingWorkspaceProps): React.ComponentProps<
  typeof ReadingWorkspaceView
> {
  const { capture, source } = reading;
  const articleRef = useRef<HTMLElement>(null);
  const toolsScrollRef = useRef<HTMLDivElement>(null);
  const pendingFragment = useRef<string | undefined>(undefined);
  const highlightPendingFragment = useRef(false);
  const [notesIdentity, setNotesIdentity] = useState<string>();
  const [selectedReference, setSelectedReference] =
    useState<ReadingReference>();
  const [editingAnnotationId, setEditingAnnotationId] = useState<string>();
  const [readingToolTab, setReadingToolTab] = useState<ReadingToolTab>(
    view === "bibliography" ? "bibliography" : "contents",
  );
  const [citationScrollRequest, setCitationScrollRequest] = useState(0);

  useReadingNavigationObservations({
    componentIdentity: component.identity,
    initialFragment,
    notesIdentity,
    selectedCitation,
    selectedReference,
    view,
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
    component,
    sourceId: source.id,
    stateId: source.stateId,
    onViewChange,
  });

  const resumeStatus = useReadingResume({
    component,
    ephemeralScrollTop,
    explicitFragment: initialFragment,
    sourceId: source.id,
    stateId: source.stateId,
  });
  usePendingFragmentScroll({
    componentIdentity: component.identity,
    highlightPendingFragment,
    initialFragment,
    notesIdentity,
    pendingFragment,
    toolsScrollRef,
  });

  const referenceIndex = createReferenceIndex(component);

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
  const handleReadingToolTabChange = createReadingToolTabChangeHandler({
    onViewChange,
    saveLocation,
    setReadingToolTab,
    view,
  });
  const returnToCitationTarget = createReturnToCitationHandler({
    component,
    handleComponentChange,
    highlightPendingFragment,
    onViewChange,
    pendingFragment,
    preserveScroll,
    reading,
    returnToCitation,
    setNotesIdentity,
    setReadingToolTab,
    view,
  });
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
        onOpenCitation: openCitation,
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
        onReturnCitation: returnToCitationTarget,
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
        onJumpReference: createReferenceJumper(toolsScrollRef),
        onOpenAuthoredLink: openAuthoredLink,
        onOpenCitation: openCitation,
        onOpenReference: openReference,
        publisherNotes: notes,
        referenceIndex,
        selectedReference,
      },
    },
  };
}

function ReadingWorkspaceView({
  articlePaneProps,
  readingToolsProps,
}: {
  articlePaneProps: React.ComponentProps<typeof ReadingArticlePane>;
  readingToolsProps: React.ComponentProps<typeof ReadingToolsPanel>;
}) {
  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center 2xl:max-w-[104rem]">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            hash="source-information"
            to="."
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Source information
          </Link>
          <span className="ml-auto font-semibold font-serif text-xl">
            Lirna
          </span>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[104rem] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:px-10 lg:py-12 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:gap-12">
        <ReadingArticlePane {...articlePaneProps} />
        <div className="z-20 self-start lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
          <ReadingToolsPanel {...readingToolsProps} />
        </div>
      </div>
    </main>
  );
}
