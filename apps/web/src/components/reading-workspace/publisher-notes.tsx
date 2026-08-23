import {
  AuthoredLinkActions,
  Blocks,
  CitationActions,
  ReadingSection,
  type SepReadingData,
} from "./content";
import {
  type ReadingReference,
  ReferenceActions,
  type ReferenceIndex,
} from "./references";

export function PublisherNotes({
  component,
  onJumpReference,
  onOpenAuthoredLink,
  onOpenCitation,
  onOpenReference,
  referenceIndex,
}: {
  component: SepReadingData["components"][number];
  onJumpReference: (reference: ReadingReference) => void;
  onOpenAuthoredLink: (
    from: SepReadingData["components"][number],
    href: string,
    label: string,
  ) => boolean;
  onOpenCitation: (
    from: SepReadingData["components"][number],
    entryId: string | undefined,
    mentionId: string,
  ) => void;
  onOpenReference: (reference: ReadingReference) => void;
  referenceIndex: ReferenceIndex;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <div>
        <p className="font-medium text-sm">{component.label}</p>
        <p className="text-muted-foreground text-xs">
          Publisher-authored notes for this reading.
        </p>
      </div>
      <ReferenceActions.Provider
        value={{
          index: referenceIndex,
          jump: onJumpReference,
          open: onOpenReference,
        }}
      >
        <CitationActions.Provider
          value={{
            open: (entryId, mentionId) =>
              onOpenCitation(component, entryId, mentionId),
          }}
        >
          <AuthoredLinkActions.Provider
            value={{
              open: (href, label) => onOpenAuthoredLink(component, href, label),
            }}
          >
            <article className="flex flex-col gap-5 font-serif text-base leading-7">
              <Blocks blocks={component.introductoryBlocks} />
              {component.sections.map((section) => (
                <ReadingSection key={section.id} section={section} />
              ))}
            </article>
          </AuthoredLinkActions.Provider>
        </CitationActions.Provider>
      </ReferenceActions.Provider>
    </section>
  );
}
