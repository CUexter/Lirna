import { ReadingAnnotations } from "../annotations/annotations";
import { SepReadingBreadcrumb } from "./breadcrumb";
import { SepReadingCaptureStatus } from "./capture-status";
import { SepReadingComponentNav } from "./component-nav";
import {
  AuthoredLinkActions,
  Blocks,
  CitationActions,
  Figure,
  placedFigureIds,
  ReadingSection,
  type SepReadingData,
} from "./content";
import {
  type ReadingReference,
  ReferenceActions,
  type ReferenceIndex,
} from "./references";
import { ReadingResearchAssistant } from "./research-assistant";
import { SepReadingSourceHeader } from "./source-header";

type Component = SepReadingData["components"][number];

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
    onEditHandled: () => void;
    view: "article" | "bibliography";
  };
  articleRef: React.RefObject<HTMLElement | null>;
  capture: SepReadingData["capture"];
  component: Component;
  contentActions: {
    onOpenAuthoredLink: (href: string, label: string) => boolean;
    onOpenCitation: (entryId: string | undefined, mentionId: string) => void;
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
  resumeStatus: "saving" | "saved" | "error";
  source: SepReadingData["source"];
}) {
  const { editingId, onEditHandled, view } = annotations;
  const {
    onOpenAuthoredLink,
    onOpenCitation,
    onJumpReference,
    onOpenReference,
    referenceIndex,
  } = contentActions;
  const { mainComponentIdentity, next, onComponentChange, parent, previous } =
    navigation;
  return (
    <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
      <SepReadingSourceHeader
        capture={capture}
        component={component}
        source={source}
      />
      <ReadingSyncStatus component={component} status={resumeStatus} />
      <SepReadingCaptureStatus capture={capture} />
      <SepReadingBreadcrumb
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
        <AuthoredLinkActions.Provider value={{ open: onOpenAuthoredLink }}>
          <CitationActions.Provider value={{ open: onOpenCitation }}>
            <ReadingDocument articleRef={articleRef} component={component} />
          </CitationActions.Provider>
        </AuthoredLinkActions.Provider>
      </ReferenceActions.Provider>
      <ArticleAnnotations
        articleRef={articleRef}
        component={component}
        editingAnnotationId={editingId}
        onEditAnnotationHandled={onEditHandled}
        readingView={view}
        source={source}
      />
      <ReadingResearchAssistant
        componentIdentity={component.identity}
        componentLabel={component.label}
        sourceId={source.id}
        stateId={source.stateId}
        sourceTitle={source.title}
      />
      <SepReadingComponentNav
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
  status: "saving" | "saved" | "error";
}) {
  const message =
    status === "saving"
      ? "Syncing reading position..."
      : status === "error"
        ? "Reading position could not sync"
        : `Reading position synced for ${component.label}`;
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-sm">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${status === "error" ? "bg-destructive" : "bg-emerald-500"}`}
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
  component,
  editingAnnotationId,
  onEditAnnotationHandled,
  readingView,
  source,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
  component: Component;
  editingAnnotationId?: string;
  onEditAnnotationHandled: () => void;
  readingView: "article" | "bibliography";
  source: SepReadingData["source"];
}) {
  if (readingView !== "article") return null;
  return (
    <ReadingAnnotations
      articleRef={articleRef}
      componentIdentity={component.identity}
      editAnnotationId={editingAnnotationId}
      key={component.identity}
      onEditAnnotationHandled={onEditAnnotationHandled}
      plainText={component.plainText}
      resting={{ showTools: false }}
      sourceId={source.id}
      stateId={source.stateId}
    />
  );
}
