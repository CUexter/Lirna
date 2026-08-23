import { Button } from "@lirna/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lirna/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenTextIcon,
  FilesIcon,
  ListTreeIcon,
  StickyNoteIcon,
} from "lucide-react";

import { library } from "@/clients/library";
import { Bibliography } from "./bibliography";
import type { SepReadingData } from "./content";
import { PublisherNotes } from "./publisher-notes";
import { ReadingEmptyState } from "./reading-empty-state";
import type { ReadingNavigation } from "./reading-navigation";
import type {
  ReadingSceneScrollOwner,
  ReadingSceneTopology,
} from "./reading-scene-topology";
import { useReadingToolsLocation } from "./reading-tools-positions";
import {
  createReferenceIndex,
  type ReadingReference,
  type ReferenceIndex,
  ReferencePreview,
} from "./references";
import { Toc } from "./sidebar";

export type ReadingToolTab =
  | "contents"
  | "bibliography"
  | "notes"
  | "supplementary";
type ReadingComponent = SepReadingData["components"][number];

export function ReadingToolsPanel({
  bibliography,
  component,
  components,
  topology,
  navigation,
  notes,
  scrollContainerRef,
  supplementary,
}: {
  bibliography: {
    citationScrollRequest: number;
    mainComponentIdentity: string;
    navigation: ReadingNavigation;
    onReturnCitation: (mentionId: string, componentIdentity: string) => void;
    selectedComponentIdentity?: string;
    selectedEntry?: string;
  };
  component: ReadingComponent;
  components: SepReadingData["components"];
  topology: ReadingSceneTopology;
  navigation: {
    activeTab: ReadingToolTab;
    onActiveTabChange: (tab: ReadingToolTab) => void;
    onComponentChange: (identity: string) => void;
  };
  notes: {
    onOpenAnnotation: (annotationId: string) => void;
    sourceId: string;
    stateId: string;
  };
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  supplementary: {
    onJumpReference: (reference: ReadingReference) => void;
    onOpenAuthoredLink: (
      from: ReadingComponent,
      href: string,
      label: string,
    ) => boolean;
    onOpenCitation: (
      from: ReadingComponent,
      entryId: string | undefined,
      mentionId: string,
    ) => void;
    onOpenReference: (reference: ReadingReference) => void;
    publisherNotes?: ReadingComponent;
    publisherNotesOwner?: ReadingSceneScrollOwner;
    referenceIndex: ReferenceIndex;
    selectedReference?: ReadingReference;
  };
}) {
  const saveToolsLocation = useReadingToolsLocation(scrollContainerRef, {
    activeTab: navigation.activeTab,
    hasSelectedReference: Boolean(supplementary.selectedReference),
    publisherNotesOwner: supplementary.publisherNotesOwner,
  });

  return (
    <aside
      aria-label="Reading tools"
      className="flex h-[70svh] flex-col overflow-hidden rounded-md border bg-background/95 shadow-lg backdrop-blur lg:h-[calc(100vh-2rem)]"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-medium text-sm">Reading tools</p>
          <p className="text-muted-foreground text-xs">{component.label}</p>
        </div>
      </header>
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => {
          saveToolsLocation();
          navigation.onActiveTabChange(value as ReadingToolTab);
        }}
        value={navigation.activeTab}
      >
        <TabsList className="grid h-10 w-full grid-cols-4 border-b bg-transparent p-0">
          <TabsTrigger className="gap-1 px-1 text-xs" value="contents">
            <ListTreeIcon aria-hidden="true" />
            Contents
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="bibliography">
            <BookOpenTextIcon aria-hidden="true" />
            Bibliography
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="notes">
            <StickyNoteIcon aria-hidden="true" />
            Notes
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="supplementary">
            <FilesIcon aria-hidden="true" />
            Supplementary
          </TabsTrigger>
        </TabsList>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
          ref={scrollContainerRef}
        >
          <TabsContent value="contents">
            <ContentsTab component={component} />
          </TabsContent>
          <TabsContent value="bibliography">
            <Bibliography
              bibliographyComponents={{
                all: components,
                mainIdentity: bibliography.mainComponentIdentity,
              }}
              compact
              citationScrollRequest={bibliography.citationScrollRequest}
              navigation={bibliography.navigation}
              onReturn={bibliography.onReturnCitation}
              scrollContainerRef={scrollContainerRef}
              selectedComponentIdentity={
                bibliography.selectedComponentIdentity ?? component.identity
              }
              selectedEntry={bibliography.selectedEntry}
            />
          </TabsContent>
          <TabsContent className="space-y-3" value="notes">
            <NotesTab
              component={component}
              onOpenAnnotation={notes.onOpenAnnotation}
              sourceId={notes.sourceId}
              stateId={notes.stateId}
            />
          </TabsContent>
          <TabsContent className="space-y-6" value="supplementary">
            <SupplementaryTab
              component={component}
              components={components}
              onComponentChange={navigation.onComponentChange}
              topology={topology}
              publisherNotes={{
                component: supplementary.publisherNotes,
                onOpenAuthoredLink: supplementary.onOpenAuthoredLink,
                onOpenCitation: supplementary.onOpenCitation,
              }}
              references={{
                index: supplementary.referenceIndex,
                onJump: supplementary.onJumpReference,
                onOpen: supplementary.onOpenReference,
                selected: supplementary.selectedReference,
              }}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function ContentsTab({
  component,
}: {
  component: SepReadingData["components"][number];
}) {
  if (!component.toc.length) {
    return (
      <ReadingEmptyState>
        No contents are available for this component.
      </ReadingEmptyState>
    );
  }
  return (
    <nav aria-label="Component contents">
      <Toc items={component.toc} />
    </nav>
  );
}

function NotesTab({
  component,
  onOpenAnnotation,
  sourceId,
  stateId,
}: {
  component: SepReadingData["components"][number];
  onOpenAnnotation: (annotationId: string) => void;
  sourceId: string;
  stateId: string;
}) {
  const annotations = useQuery(
    library.annotations.list.queryOptions({ input: { sourceId, stateId } }),
  );
  const notes = (annotations.data ?? []).filter(
    (annotation) =>
      annotation.componentIdentity === component.identity &&
      annotation.body?.trim(),
  );

  return (
    <>
      <p className="text-muted-foreground text-xs">
        Select text in the article to add a note or highlight.
      </p>
      {annotations.isPending ? (
        <ReadingEmptyState>Loading notes...</ReadingEmptyState>
      ) : notes.length ? (
        notes.map((note) => (
          <Button
            className="h-auto w-full flex-col items-start gap-2 whitespace-normal rounded-md border p-3 text-left"
            key={note.id}
            onClick={() => onOpenAnnotation(note.id)}
            type="button"
            variant="ghost"
          >
            <span className="text-sm">{note.body}</span>
            <span className="line-clamp-4 font-serif text-muted-foreground text-xs italic">
              “{note.exactText}”
            </span>
          </Button>
        ))
      ) : (
        <ReadingEmptyState>No notes in this component yet.</ReadingEmptyState>
      )}
    </>
  );
}

function SupplementaryTab({
  component,
  components,
  onComponentChange,
  publisherNotes,
  references,
  topology,
}: {
  component: ReadingComponent;
  components: SepReadingData["components"];
  onComponentChange: (identity: string) => void;
  publisherNotes: {
    component?: ReadingComponent;
    onOpenAuthoredLink: (
      from: ReadingComponent,
      href: string,
      label: string,
    ) => boolean;
    onOpenCitation: (
      from: ReadingComponent,
      entryId: string | undefined,
      mentionId: string,
    ) => void;
  };
  references: {
    index: ReferenceIndex;
    onJump: (reference: ReadingReference) => void;
    onOpen: (reference: ReadingReference) => void;
    selected?: ReadingReference;
  };
  topology: ReadingSceneTopology;
}) {
  const selectedReference = references.selected;
  const publisherNoteReferenceIndex = publisherNotes.component
    ? createReferenceIndex(publisherNotes.component)
    : references.index;

  return (
    <>
      {selectedReference ? (
        <ReferencePreview
          compact
          onJump={() => references.onJump(selectedReference)}
          reference={selectedReference}
        />
      ) : null}
      <SourceComponents
        component={component}
        components={components}
        onComponentChange={onComponentChange}
        topology={topology}
      />
      {publisherNotes.component ? (
        <PublisherNotes
          component={publisherNotes.component}
          onJumpReference={references.onJump}
          onOpenAuthoredLink={publisherNotes.onOpenAuthoredLink}
          onOpenCitation={publisherNotes.onOpenCitation}
          onOpenReference={references.onOpen}
          referenceIndex={publisherNoteReferenceIndex}
        />
      ) : (
        <ReadingEmptyState>
          Open a publisher footnote to read it here without leaving the article.
        </ReadingEmptyState>
      )}
    </>
  );
}

function SourceComponents({
  component,
  components,
  onComponentChange,
  topology,
}: {
  component: SepReadingData["components"][number];
  components: SepReadingData["components"];
  onComponentChange: (identity: string) => void;
  topology: ReadingSceneTopology;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">Source components</p>
      {topology.scenes
        .filter(
          (scene) =>
            scene.presentationRegion === "article" &&
            scene.componentIdentity !== component.identity,
        )
        .map((scene) =>
          components.find(
            (candidate) => candidate.identity === scene.componentIdentity,
          ),
        )
        .filter((candidate) => candidate !== undefined)
        .map((candidate) => (
          <Button
            className="h-auto w-full justify-start whitespace-normal text-left"
            key={candidate.identity}
            onClick={() => onComponentChange(candidate.identity)}
            type="button"
            variant="outline"
          >
            {candidate.label}
          </Button>
        ))}
    </div>
  );
}
