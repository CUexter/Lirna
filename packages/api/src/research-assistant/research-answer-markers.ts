import { randomUUID } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";

import type {
  AliasedResearchPassageReference,
  EvidenceRelation,
  ResearchCitationOccurrence,
  ResearchPassageReference,
} from "./research-thread-contract";

const relations = new Set<EvidenceRelation>([
  "supports",
  "qualifies",
  "conflicts",
  "background",
]);
const passingMarker = /\[\^([A-Za-z\d_-]+)(?:\|([a-z]+))?\]/g;
const quoteMarker = /^:::quote\[([A-Za-z\d_-]+)(?:\|([a-z]+))?\]\r?\n:::\s*$/;
const skippedParents = new Set([
  "code",
  "inlineCode",
  "html",
  "link",
  "linkReference",
]);

export function compileResearchAnswer(
  content: string,
  candidates: AliasedResearchPassageReference[],
  createId: () => string = randomUUID,
): { content: string; references: ResearchPassageReference[] } {
  const references = candidates.map(({ evidenceAlias: _, ...reference }) => ({
    ...reference,
    ...(reference.occurrences?.length
      ? { occurrences: [...reference.occurrences] }
      : {}),
  }));
  const compiler: MarkerCompiler = {
    byAlias: new Map(
      candidates.map((candidate, index) => [
        candidate.evidenceAlias,
        references[index],
      ]),
    ),
    createId,
    replacements: [],
  };

  collectReplacements(fromMarkdown(content) as MarkdownNode, content, compiler);
  const compiledContent = applyReplacements(content, compiler.replacements);
  locateAnswerTargets(compiledContent, references);
  return { content: compiledContent, references };
}

export function researchAnswerHistoryContent(
  content: string,
  references: ResearchPassageReference[],
) {
  let historyContent = content;
  for (const reference of references) {
    for (const occurrence of reference.occurrences ?? []) {
      const marker =
        occurrence.presentation === "quote"
          ? `:::quote[${occurrence.id}]\n:::`
          : `[^${occurrence.id}]`;
      historyContent = historyContent.replaceAll(marker, "");
    }
  }
  return historyContent;
}

function collectReplacements(
  node: MarkdownNode,
  content: string,
  compiler: MarkerCompiler,
) {
  if (skippedParents.has(node.type)) return;
  if (node.type === "paragraph" && node.children?.length === 1) {
    const source = nodeSource(node, content);
    const quote = source?.match(quoteMarker);
    if (source && quote) {
      const id = compileMarker(quote[1], quote[2], "quote", compiler);
      if (id) {
        compiler.replacements.push({
          start: node.position?.start.offset ?? 0,
          end: node.position?.end.offset ?? 0,
          value: source.replace(quoteMarker, `:::quote[${id}]\n:::`),
        });
      }
      return;
    }
  }
  if (node.type === "text") collectPassingMarkers(node, content, compiler);
  for (const child of node.children ?? []) {
    collectReplacements(child, content, compiler);
  }
}

function collectPassingMarkers(
  node: MarkdownNode,
  content: string,
  compiler: MarkerCompiler,
) {
  const source = nodeSource(node, content);
  const sourceStart = node.position?.start.offset;
  if (!source || sourceStart === undefined) return;
  for (const match of source.matchAll(passingMarker)) {
    if (source[match.index - 1] === "\\") continue;
    const id = compileMarker(match[1], match[2], "passing", compiler);
    if (!id) continue;
    compiler.replacements.push({
      start: sourceStart + match.index,
      end: sourceStart + match.index + match[0].length,
      value: `[^${id}]`,
    });
  }
}

function compileMarker(
  alias: string | undefined,
  relationValue: string | undefined,
  presentation: ResearchCitationOccurrence["presentation"],
  compiler: MarkerCompiler,
) {
  if (!alias) return undefined;
  const reference = compiler.byAlias.get(alias);
  const relation = evidenceRelation(relationValue);
  if (!reference?.id || !relation) return undefined;
  const id = compiler.createId();
  reference.occurrences ??= [];
  reference.occurrences.push({
    answerTarget: { startOffset: 0, endOffset: 0 },
    id,
    presentation,
    relation,
    referenceId: reference.id,
  });
  return id;
}

function applyReplacements(content: string, replacements: Replacement[]) {
  let result = content;
  for (const replacement of replacements.toSorted(
    (left, right) => right.start - left.start,
  )) {
    result = `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`;
  }
  return result;
}

function locateAnswerTargets(
  content: string,
  references: ResearchPassageReference[],
) {
  const byId = new Map(
    references.flatMap((reference) =>
      (reference.occurrences ?? []).map(
        (occurrence) => [occurrence.id, occurrence] as const,
      ),
    ),
  );
  for (const reference of references) {
    for (const occurrence of reference.occurrences ?? []) {
      if (occurrence.presentation !== "quote") continue;
      const marker = `:::quote[${occurrence.id}]`;
      const startOffset = content.indexOf(marker);
      if (startOffset < 0) continue;
      occurrence.answerTarget = {
        startOffset,
        endOffset: startOffset + marker.length,
      };
    }
  }
  locatePassingTargets(fromMarkdown(content) as MarkdownNode, content, byId);
}

function locatePassingTargets(
  node: MarkdownNode,
  content: string,
  byId: Map<string, ResearchCitationOccurrence>,
) {
  if (["paragraph", "heading", "tableCell"].includes(node.type)) {
    locatePassingTargetsInBlock(node, content, byId);
    return;
  }
  for (const child of node.children ?? [])
    locatePassingTargets(child, content, byId);
}

function locatePassingTargetsInBlock(
  node: MarkdownNode,
  content: string,
  byId: Map<string, ResearchCitationOccurrence>,
) {
  const source = nodeSource(node, content);
  const sourceStart = node.position?.start.offset;
  if (!source || sourceStart === undefined) return;
  for (const match of source.matchAll(passingMarker)) {
    const occurrence = match[1] ? byId.get(match[1]) : undefined;
    if (occurrence?.presentation !== "passing") continue;
    const markerStart = sourceStart + match.index;
    occurrence.answerTarget = claimTarget(
      source,
      sourceStart,
      match.index,
      markerStart,
    );
  }
}

function claimTarget(
  blockSource: string,
  blockStart: number,
  markerIndex: number,
  markerStart: number,
) {
  const precedingMarkers = [
    ...blockSource.slice(0, markerIndex).matchAll(passingMarker),
  ];
  const precedingMarker = precedingMarkers.at(-1);
  const precedingMarkerEnd = precedingMarker
    ? precedingMarker.index + precedingMarker[0].length
    : 0;
  if (
    precedingMarker &&
    !blockSource.slice(precedingMarkerEnd, markerIndex).trim()
  ) {
    return claimTarget(
      blockSource,
      blockStart,
      precedingMarker.index,
      blockStart + precedingMarker.index,
    );
  }
  let searchEnd = markerIndex;
  while (/\s/.test(blockSource[searchEnd - 1] ?? "")) searchEnd -= 1;
  if (/[.!?]/.test(blockSource[searchEnd - 1] ?? "")) searchEnd -= 1;
  const prefix = blockSource.slice(0, searchEnd);
  let startInBlock = Math.max(
    precedingMarkerEnd,
    afterLast(prefix, ". "),
    afterLast(prefix, "? "),
    afterLast(prefix, "! "),
  );
  while (/\s/.test(blockSource[startInBlock] ?? "")) startInBlock += 1;
  return { startOffset: blockStart + startInBlock, endOffset: markerStart };
}

function afterLast(value: string, delimiter: string) {
  const index = value.lastIndexOf(delimiter);
  return index < 0 ? 0 : index + delimiter.length;
}

function nodeSource(node: MarkdownNode, content: string) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined
    ? undefined
    : content.slice(start, end);
}

function evidenceRelation(
  value: string | undefined,
): EvidenceRelation | undefined {
  if (!value) return "supports";
  return relations.has(value as EvidenceRelation)
    ? (value as EvidenceRelation)
    : undefined;
}

interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

interface MarkerCompiler {
  byAlias: Map<string, ResearchPassageReference | undefined>;
  createId: () => string;
  replacements: Replacement[];
}

interface Replacement {
  start: number;
  end: number;
  value: string;
}
