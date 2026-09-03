import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
} from "@lirna/ui/components/ai-elements/inline-citation";
import { MessageResponse } from "@lirna/ui/components/ai-elements/message";
import { Button } from "@lirna/ui/components/button";
import { createContext, useContext } from "react";

import type { ArticlePassage } from "../../navigation/hooks/useShowInArticle";
import type { ResearchPassageReference } from "../researchAssistantTransport";
import {
  type EvidenceMarkerProps,
  parsePassingMarkerProps,
  researchEvidenceMarkers,
} from "./researchEvidenceMarkers";

type EvidenceRelation = "supports" | "qualifies" | "conflicts" | "background";
type Presentation = "passing" | "quote";
type LiveReference = ResearchPassageReference & { evidenceAlias?: string };

const relations = new Set<EvidenceRelation>([
  "supports",
  "qualifies",
  "conflicts",
  "background",
]);
const markerAllowedTags = {
  "research-citation": ["token", "relation", "markers"],
  "research-quote": ["token", "relation"],
};
const markerComponents = {
  "research-citation": PassingCitation,
  "research-quote": ExactQuote,
};
const markerPlugins = [researchEvidenceMarkers];

const ResearchAnswerContext = createContext<{
  answer: string;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  references: LiveReference[];
} | null>(null);

export function ResearchAnswer({
  answer,
  passageForReference,
  references,
}: {
  answer: string;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  references: ResearchPassageReference[];
}) {
  return (
    <ResearchAnswerContext.Provider
      value={{
        answer,
        passageForReference,
        references: references as LiveReference[],
      }}
    >
      <MessageResponse
        allowedTags={markerAllowedTags}
        className="research-answer"
        components={markerComponents}
        remarkPlugins={markerPlugins}
      >
        {answer}
      </MessageResponse>
    </ResearchAnswerContext.Provider>
  );
}

function PassingCitation(props: Record<string, unknown>) {
  const markers = passingMarkerProps(props);
  return (
    <CitationControl
      fallback={
        typeof props.markers === "string"
          ? props.markers
          : markers.map(passingMarkerText).join("")
      }
      markerProps={markers}
      presentation="passing"
    />
  );
}

function ExactQuote(props: Record<string, unknown>) {
  const markerPropsValue = markerProps(props);
  const marker = useEvidenceMarker("quote", markerPropsValue);
  if (!marker) {
    return <p>{`:::quote[${markerToken(markerPropsValue)}]\n:::`}</p>;
  }
  return (
    <blockquote className="flex flex-col gap-2 border-l-2 pl-3">
      <p className="font-serif text-sm leading-relaxed">
        {marker.reference.selection.exactText}
      </p>
      <CitationControl marker={marker} presentation="quote" />
    </blockquote>
  );
}

function CitationControl({
  marker: suppliedMarker,
  markerProps: suppliedMarkerProps,
  presentation,
  relation,
  token,
  fallback,
}: {
  fallback?: string;
  marker?: ResolvedMarker;
  markerProps?: EvidenceMarkerProps[];
  presentation: Presentation;
  relation?: string;
  token?: string;
}) {
  const markerPropsValues = suppliedMarkerProps ?? [{ relation, token }];
  const resolvedMarkers = useEvidenceMarkers(presentation, markerPropsValues);
  const markers = suppliedMarker ? [suppliedMarker] : resolvedMarkers;
  const context = useContext(ResearchAnswerContext);
  if (!markers.length || markers.length !== markerPropsValues.length)
    return fallback ?? null;
  if (!context) return null;
  const citations = markers
    .map((marker) => ({
      marker,
      number: context.references.indexOf(marker.reference) + 1,
      passage: context.passageForReference(marker.reference),
      relationLabel: relationLabel(marker.relation),
      claimText:
        marker.occurrence?.presentation === "passing"
          ? context.answer.slice(
              marker.occurrence.answerTarget.startOffset,
              marker.occurrence.answerTarget.endOffset,
            )
          : undefined,
    }))
    .toSorted((left, right) => left.number - right.number);
  const grouped = citations.length > 1;
  const citationNumbers = citations.map(({ number }) => number).join(", ");
  const ariaLabel = grouped
    ? `Citations ${citationNumbers}: ${citations
        .map(
          ({ marker, relationLabel: label }) =>
            `${label} from ${marker.reference.componentLabel}`,
        )
        .join("; ")}`
    : `Citation ${citationNumbers}: ${citations[0]?.relationLabel} from ${citations[0]?.marker.reference.componentLabel}`;

  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          aria-label={ariaLabel}
          label={`[${citationNumbers}]`}
          onClick={() => citations[0]?.passage.show()}
        />
        <InlineCitationCardBody className="max-h-[min(24rem,calc(100dvh-2rem))] overflow-y-auto overscroll-contain">
          <InlineCitationCarousel>
            {grouped ? (
              <InlineCitationCarouselHeader className="sticky top-0 z-10">
                <InlineCitationCarouselPrev />
                <InlineCitationCarouselNext />
                <InlineCitationCarouselIndex />
              </InlineCitationCarouselHeader>
            ) : null}
            <InlineCitationCarouselContent>
              {citations.map(
                ({
                  marker,
                  number,
                  passage,
                  relationLabel: label,
                  claimText,
                }) => (
                  <InlineCitationCarouselItem
                    key={`${number}:${marker.reference.selection.normalizedStartOffset}:${label}`}
                  >
                    <Button
                      type="button"
                      aria-label={`Show citation ${number} in article`}
                      className="h-auto w-full min-w-0 flex-col items-stretch justify-start gap-3 whitespace-normal rounded-none p-0 text-left font-normal transition-opacity hover:bg-transparent hover:opacity-80 focus-visible:outline-2 focus-visible:-outline-offset-2 [&>*]:min-w-0"
                      onClick={() => passage.show()}
                      variant="ghost"
                    >
                      {claimText ? (
                        <p className="text-muted-foreground text-xs">
                          <span className="font-medium text-foreground">
                            Claim:
                          </span>
                          {claimText}
                        </p>
                      ) : null}
                      <InlineCitationSource
                        description={label}
                        title={marker.reference.componentLabel}
                      />
                      <InlineCitationQuote className="break-words text-left">
                        {marker.reference.selection.exactText}
                      </InlineCitationQuote>
                      <p className="text-[11px] text-muted-foreground">
                        This evidence relation is structural, not proof of
                        semantic entailment.
                      </p>
                    </Button>
                  </InlineCitationCarouselItem>
                ),
              )}
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}

interface ResolvedMarker {
  reference: LiveReference;
  relation: EvidenceRelation;
  occurrence?: NonNullable<ResearchPassageReference["occurrences"]>[number];
}

function useEvidenceMarker(
  presentation: Presentation,
  { relation, token }: { relation?: string; token?: string },
): ResolvedMarker | undefined {
  return useEvidenceMarkers(presentation, [{ relation, token }])[0];
}

function useEvidenceMarkers(
  presentation: Presentation,
  markers: EvidenceMarkerProps[],
) {
  const context = useContext(ResearchAnswerContext);
  if (!context) return [];
  return markers.flatMap(({ relation, token }) => {
    const marker = resolveEvidenceMarker(context.references, presentation, {
      relation,
      token,
    });
    return marker ? [marker] : [];
  });
}

function resolveEvidenceMarker(
  references: LiveReference[],
  presentation: Presentation,
  { relation, token }: { relation?: string; token?: string },
) {
  if (!token) return undefined;
  for (const reference of references) {
    if (reference.evidenceAlias === token) {
      const parsedRelation = evidenceRelation(relation);
      return parsedRelation
        ? { reference, relation: parsedRelation }
        : undefined;
    }
    const occurrence = reference.occurrences?.find(
      (candidate) =>
        candidate.id === token && candidate.presentation === presentation,
    );
    if (occurrence)
      return { reference, relation: occurrence.relation, occurrence };
  }
  return undefined;
}

function passingMarkerProps(props: Record<string, unknown>) {
  if (typeof props.markers !== "string") return [markerProps(props)];
  return parsePassingMarkerProps(props.markers);
}

function markerProps(props: Record<string, unknown>) {
  return {
    relation: typeof props.relation === "string" ? props.relation : undefined,
    token: typeof props.token === "string" ? props.token : undefined,
  };
}

function passingMarkerText(marker: { relation?: string; token?: string }) {
  return `[^${markerToken(marker)}]`;
}

function markerToken(marker: { relation?: string; token?: string }) {
  return `${marker.token ?? ""}${marker.relation ? `|${marker.relation}` : ""}`;
}

function evidenceRelation(
  value: string | undefined,
): EvidenceRelation | undefined {
  if (!value) return "supports";
  return relations.has(value as EvidenceRelation)
    ? (value as EvidenceRelation)
    : undefined;
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function relationLabel(relation: EvidenceRelation) {
  return relation === "supports"
    ? "Supporting evidence"
    : `${capitalize(relation)} evidence`;
}
