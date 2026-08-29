import {
  type ReadingReference,
  ReferenceActions,
  type ReferenceIndex,
} from "../../bibliography/components/References";
import {
  Blocks,
  CitationActions,
  PublisherAuthoredLinkActions,
  type ReadingDerivative,
  ReadingSection,
} from "./Content";

export function PublisherNotes({
  component,
  onJumpReference,
  onOpenPublisherAuthoredLink,
  onOpenCitation,
  onOpenReference,
  referenceIndex,
}: {
  component: ReadingDerivative["components"][number];
  onJumpReference: (reference: ReadingReference) => void;
  onOpenPublisherAuthoredLink: (
    from: ReadingDerivative["components"][number],
    href: string,
    label: string,
  ) => boolean;
  onOpenCitation: (
    from: ReadingDerivative["components"][number],
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
          <PublisherAuthoredLinkActions.Provider
            value={{
              open: (href, label) =>
                onOpenPublisherAuthoredLink(component, href, label),
            }}
          >
            <article
              className="flex flex-col gap-5 font-serif text-base leading-7"
              data-reading-scene-identity={component.identity}
              data-reading-scene-owner="publisher-note"
            >
              <Blocks blocks={component.introductoryBlocks} />
              {component.sections.map((section) => (
                <ReadingSection key={section.id} section={section} />
              ))}
            </article>
          </PublisherAuthoredLinkActions.Provider>
        </CitationActions.Provider>
      </ReferenceActions.Provider>
    </section>
  );
}
