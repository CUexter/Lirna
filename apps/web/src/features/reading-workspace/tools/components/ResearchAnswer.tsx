import { MessageResponse } from "@lirna/ui/components/ai-elements/message";
import { Button } from "@lirna/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@lirna/ui/components/popover";
import { createContext, useContext } from "react";

import type { ArticlePassage } from "../../navigation/hooks/useShowInArticle";
import type { ResearchPassageReference } from "../researchAssistantTransport";

type EvidenceRelation = "supports" | "qualifies" | "conflicts" | "background";
type Presentation = "passing" | "quote";
type MarkerNode = {
  type: string;
  value?: string;
  children?: MarkerNode[];
  data?: {
    hName: string;
    hProperties: { relation?: string; token: string };
  };
};
type LiveReference = ResearchPassageReference & { evidenceAlias?: string };

const markerPattern = /\[\^([A-Za-z\d_-]+)(?:\|([a-z]+))?\]/g;
const quotePattern = /^:::quote\[([A-Za-z\d_-]+)(?:\|([a-z]+))?\]\n:::\s*$/;
const relations = new Set<EvidenceRelation>([
  "supports",
  "qualifies",
  "conflicts",
  "background",
]);
const markerAllowedTags = {
  "research-citation": ["token", "relation"],
  "research-quote": ["token", "relation"],
};
const markerComponents = {
  "research-citation": PassingCitation,
  "research-quote": ExactQuote,
};
const markerPlugins = [researchEvidenceMarkers];

const ResearchAnswerContext = createContext<{
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
        passageForReference,
        references: references as LiveReference[],
      }}
    >
      <MessageResponse
        allowedTags={markerAllowedTags}
        components={markerComponents}
        remarkPlugins={markerPlugins}
      >
        {answer}
      </MessageResponse>
    </ResearchAnswerContext.Provider>
  );
}

function PassingCitation(props: Record<string, unknown>) {
  const marker = markerProps(props);
  return (
    <CitationControl
      fallback={passingMarkerText(marker)}
      presentation="passing"
      {...marker}
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
  presentation,
  relation,
  token,
  fallback,
}: {
  fallback?: string;
  marker?: ResolvedMarker;
  presentation: Presentation;
  relation?: string;
  token?: string;
}) {
  const resolvedMarker = useEvidenceMarker(presentation, { relation, token });
  const marker = suppliedMarker ?? resolvedMarker;
  const context = useContext(ResearchAnswerContext);
  if (!marker) return fallback ?? null;
  if (!context) return null;
  const passage = context.passageForReference(marker.reference);
  const citationNumber = context.references.indexOf(marker.reference) + 1;
  const relationLabel =
    marker.relation === "supports"
      ? "Supporting evidence"
      : `${capitalize(marker.relation)} evidence`;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Citation ${citationNumber}: ${relationLabel} from ${marker.reference.componentLabel}`}
        render={<Button size="sm" type="button" variant="outline" />}
      >
        [{citationNumber}]
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-[calc(100vw-2rem)]"
        side="top"
      >
        <PopoverHeader>
          <PopoverTitle>{marker.reference.componentLabel}</PopoverTitle>
          <PopoverDescription>{relationLabel}</PopoverDescription>
        </PopoverHeader>
        <blockquote className="border-l-2 pl-2 text-foreground leading-relaxed">
          {marker.reference.selection.exactText}
        </blockquote>
        <Button
          onClick={() => passage.show()}
          size="sm"
          type="button"
          variant="outline"
        >
          Show in article
        </Button>
      </PopoverContent>
    </Popover>
  );
}

interface ResolvedMarker {
  reference: LiveReference;
  relation: EvidenceRelation;
}

function useEvidenceMarker(
  presentation: Presentation,
  { relation, token }: { relation?: string; token?: string },
): ResolvedMarker | undefined {
  const context = useContext(ResearchAnswerContext);
  if (!context || !token) return undefined;
  for (const reference of context.references) {
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
    if (occurrence) return { reference, relation: occurrence.relation };
  }
  return undefined;
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

function researchEvidenceMarkers() {
  return (tree: MarkerNode) => transformNode(tree);
}

function transformNode(node: MarkerNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "paragraph") {
      const value =
        child.children?.length === 1 ? child.children[0]?.value : undefined;
      const quote = value?.match(quotePattern);
      if (quote?.[1]) return [markerNode("research-quote", quote[1], quote[2])];
    }
    if (child.type === "text" && child.value) return passingNodes(child.value);
    transformNode(child);
    return [child];
  });
}

function passingNodes(value: string) {
  const nodes: MarkerNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(markerPattern)) {
    const index = match.index;
    if (index > cursor)
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    nodes.push(markerNode("research-citation", match[1] ?? "", match[2]));
    cursor = index + match[0].length;
  }
  if (cursor < value.length)
    nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", value }];
}

function markerNode(
  type: string,
  token: string,
  relation?: string,
): MarkerNode {
  return {
    type,
    data: {
      hName: type,
      hProperties: { token, ...(relation ? { relation } : {}) },
    },
  };
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
