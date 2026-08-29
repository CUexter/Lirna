import {
  ReadingAnnotations,
  useAnnotationNavigation,
} from "../annotations/annotations";
import {
  citationResolutionStyleContent,
  useCitationResolutionHighlights,
} from "../annotations/citation-resolution-dom";
import type {
  CitationResolution,
  SelectionDraft,
} from "../annotations/dom-utils";
import { ReadingBreadcrumb } from "./breadcrumb";
import { ReadingCaptureStatus } from "./capture-status";
import { ReadingComponentNav } from "./component-nav";
import {
  Blocks,
  CitationActions,
  Figure,
  PublisherAuthoredLinkActions,
  placedFigureIds,
  type ReadingDerivative,
  ReadingSection,
} from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingReference,
  ReferenceActions,
  type ReferenceIndex,
} from "./references";
import { ReadingResearchAssistant } from "./research-assistant";
import { ReadingSourceHeader } from "./source-header";

type Component = ReadingDerivative["components"][number];

export function ReadingArticlePane({
  annotations,
  articleRef,
  capture,
  component,
  contentActions,
  navigation,
  resumeStatus,
  source,
}: {
  annotations: {
    editingId?: string;
    navigation: ReadingNavigation;
    onEditHandled: () => void;
    onLinkBibliography?: (selection: SelectionDraft) => void;
    onUnsavedChange: (unsaved: boolean) => void;
    view: "article" | "bibliography";
  };
  articleRef: React.RefObject<HTMLElement | null>;
  capture: ReadingDerivative["capture"];
  component: Component;
  contentActions: {
    citationResolutions: CitationResolution[];
    onOpenPublisherAuthoredLink: (href: string, label: string) => boolean;
    onOpenCitation: (entryId: string | undefined, mentionId: string) => void;
    onOpenCitationResolution: (
      entryId: string,
      resolutionId: string,
      bibliographyComponentIdentity: string,
    ) => void;
    onJumpReference: (reference: ReadingReference) => void;
    onOpenReference: (reference: ReadingReference) => void;
    referenceIndex: ReferenceIndex;
  };
  navigation: {
    mainComponentIdentity: string;
    next?: Component;
    onComponentChange: (identity: string) => void;
    parent?: Component;
    previous?: Component;
  };
  resumeStatus: "saving" | "saved" | "pending" | "error";
  source: ReadingDerivative["source"];
}) {
  const {
    editingId,
    navigation: annotationNavigation,
    onEditHandled,
    onLinkBibliography,
    onUnsavedChange,
    view,
  } = annotations;
  const {
    citationResolutions,
    onOpenPublisherAuthoredLink,
    onOpenCitation,
    onOpenCitationResolution,
    onJumpReference,
    onOpenReference,
    referenceIndex,
  } = contentActions;
  const { mainComponentIdentity, next, onComponentChange, parent, previous } =
    navigation;
  useCitationResolutionHighlights({
    articleRef,
    componentIdentity: component.identity,
    plainText: component.plainText,
    resolutions: citationResolutions,
  });
  return (
    <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
      <style>{citationResolutionStyleContent}</style>
      <ReadingSourceHeader
        capture={capture}
        component={component}
        source={source}
      />
      <ReadingSyncStatus component={component} status={resumeStatus} />
      <ReadingCaptureStatus capture={capture} />
      <ReadingBreadcrumb
        component={component}
        mainComponentIdentity={mainComponentIdentity}
        onSelect={onComponentChange}
        parent={parent}
        sourceTitle={source.title}
      />
      <ReferenceActions.Provider
        value={{
          index: referenceIndex,
          jump: onJumpReference,
          open: onOpenReference,
        }}
      >
        <PublisherAuthoredLinkActions.Provider
          value={{ open: onOpenPublisherAuthoredLink }}
        >
          <CitationActions.Provider value={{ open: onOpenCitation }}>
            <ReadingDocument articleRef={articleRef} component={component} />
          </CitationActions.Provider>
        </PublisherAuthoredLinkActions.Provider>
      </ReferenceActions.Provider>
      <ArticleAnnotations
        articleRef={articleRef}
        key={component.identity}
        navigation={annotationNavigation}
        onLinkBibliography={onLinkBibliography}
        onOpenCitationResolution={onOpenCitationResolution}
        readingView={view}
        reading={{ citationResolutions, component, source }}
        transition={{
          editingAnnotationId: editingId,
          onEditAnnotationHandled: onEditHandled,
          onUnsavedChange,
        }}
      />
      <ReadingResearchAssistant
        componentIdentity={component.identity}
        componentLabel={component.label}
        sourceId={source.id}
        stateId={source.stateId}
        sourceTitle={source.title}
      />
      <ReadingComponentNav
        next={next}
        onSelect={onComponentChange}
        previous={previous}
      />
    </div>
  );
}

function ReadingSyncStatus({
  component,
  status,
}: {
  component: Component;
  status: "saving" | "saved" | "pending" | "error";
}) {
  const message = {
    saving: "Saving reading position...",
    error: "Reading position could not be saved",
    pending: "Reading position saved locally; synchronization will retry",
    saved: `Reading position synchronized for ${component.label}`,
  }[status];
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-sm">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${status === "error" ? "bg-destructive" : status === "pending" ? "bg-amber-500" : "bg-emerald-500"}`}
      />
      {message}
    </p>
  );
}

function ReadingDocument({
  articleRef,
  component,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
  component: Component;
}) {
  const placedFigures = placedFigureIds(component);
  return (
    <article
      className="flex flex-col gap-8 font-serif text-lg leading-8 2xl:text-xl 2xl:leading-9"
      ref={articleRef}
    >
      <Blocks blocks={component.introductoryBlocks} />
      {component.sections.map((section) => (
        <ReadingSection key={section.id} section={section} />
      ))}
      {component.figures
        .filter((figure) => !placedFigures.has(figure.id))
        .map((figure) => (
          <Figure figure={figure} key={figure.id} />
        ))}
    </article>
  );
}

function ArticleAnnotations({
  articleRef,
  navigation,
  onLinkBibliography,
  onOpenCitationResolution,
  reading: { citationResolutions, component, source },
  readingView,
  transition,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
  navigation: ReadingNavigation;
  onLinkBibliography?: (selection: SelectionDraft) => void;
  onOpenCitationResolution: (
    entryId: string,
    resolutionId: string,
    bibliographyComponentIdentity: string,
  ) => void;
  reading: {
    citationResolutions: CitationResolution[];
    component: Component;
    source: ReadingDerivative["source"];
  };
  readingView: "article" | "bibliography";
  transition: {
    editingAnnotationId?: string;
    onEditAnnotationHandled: () => void;
    onUnsavedChange: (unsaved: boolean) => void;
  };
}) {
  const navigateToAnnotation = useAnnotationNavigation({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    plainText: component.plainText,
  });
  if (readingView !== "article") return null;
  return (
    <ReadingAnnotations
      articleRef={articleRef}
      editAnnotationId={transition.editingAnnotationId}
      navigateToAnnotation={navigateToAnnotation}
      key={component.identity}
      onEditAnnotationHandled={transition.onEditAnnotationHandled}
      onLinkBibliography={onLinkBibliography}
      onOpenCitationResolution={onOpenCitationResolution}
      onUnsavedChange={transition.onUnsavedChange}
      reading={{
        citationResolutions,
        componentIdentity: component.identity,
        plainText: component.plainText,
        sourceId: source.id,
        stateId: source.stateId,
      }}
      resting={{ showTools: false }}
    />
  );
}
