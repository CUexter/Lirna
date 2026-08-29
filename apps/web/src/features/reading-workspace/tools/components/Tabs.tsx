import { Button } from "@lirna/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { library } from "@/clients/library";
import { ReadingEmptyState } from "../../article/components/EmptyState";
import { PublisherNotes } from "../../article/components/PublisherNotes";
import {
  createReferenceIndex,
  type ReadingReference,
  type ReferenceIndex,
  ReferencePreview,
} from "../../bibliography/components/References";
import { Toc } from "../../components/Toc";
import type { ReadingSceneTopology } from "../../navigation/sceneTopology";
import type { ReadingComponent, ReadingToolsPanelProps } from "../panel.types";

export function ContentsTab({ component }: { component: ReadingComponent }) {
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

export function NotesTab({
  component,
  onOpenAnnotation,
  sourceId,
  stateId,
}: {
  component: ReadingComponent;
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

export function SupplementaryTab({
  component,
  components,
  onComponentChange,
  publisherNotes,
  references,
  topology,
}: {
  component: ReadingComponent;
  components: ReadingToolsPanelProps["components"];
  onComponentChange: (identity: string) => void;
  publisherNotes: {
    component?: ReadingComponent;
    onOpenPublisherAuthoredLink: ReadingToolsPanelProps["supplementary"]["onOpenPublisherAuthoredLink"];
    onOpenCitation: ReadingToolsPanelProps["supplementary"]["onOpenCitation"];
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
          onOpenPublisherAuthoredLink={
            publisherNotes.onOpenPublisherAuthoredLink
          }
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
  component: ReadingComponent;
  components: ReadingToolsPanelProps["components"];
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
