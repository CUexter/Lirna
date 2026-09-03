import type { EvidenceComponent } from "./evidence-resolution";

export interface EvidenceSegment {
  componentIdentity: string;
  componentLabel: string;
  blockIdentity: string;
  passage: string;
  before: string;
  after: string;
  startOffset: number;
  endOffset: number;
  lexicalTerms: string[];
}

const maximumSegmentCharacters = 2_000;
const hardMaximumSegmentCharacters = 20_000;

/**
 * The canonical segment index for one Reading component: publisher-authored
 * blocks, sentence-split when oversized, each segment pre-tokenized for
 * lexical retrieval.
 */
export function componentSegments(
  component: EvidenceComponent,
): EvidenceSegment[] {
  const matches = [
    ...component.plainText.matchAll(/\S(?:.*?\S)?(?=\n\s*\n|$)/gs),
  ];
  const values = matches.flatMap((match, blockIndex) =>
    blockSegments(
      match[0],
      match.index ?? 0,
      `${component.identity}#${blockIndex}`,
    ),
  );
  return values.map((value, index) => ({
    componentIdentity: component.identity,
    componentLabel: component.label,
    blockIdentity: value.blockIdentity,
    passage: value.passage,
    before: values[index - 1]?.passage.slice(-240) ?? "",
    after: values[index + 1]?.passage.slice(0, 240) ?? "",
    startOffset: value.startOffset,
    endOffset: value.endOffset,
    lexicalTerms: value.lexicalTerms,
  }));
}

interface RawSegment {
  blockIdentity: string;
  passage: string;
  startOffset: number;
  endOffset: number;
  lexicalTerms: string[];
}

function blockSegments(
  text: string,
  baseOffset: number,
  blockIdentity: string,
): RawSegment[] {
  if (text.length <= maximumSegmentCharacters)
    return [plainSegment(text, baseOffset, blockIdentity)];
  const spans = sentenceSpans(text);
  const values: RawSegment[] = [];
  let start = 0;
  let index = 0;
  while (index < spans.length) {
    if ((spans[index]?.[0] ?? start) < start) {
      index += 1;
      continue;
    }
    let end = spans[index]?.[1] ?? text.length;
    let next = index + 1;
    while (
      next < spans.length &&
      (spans[next]?.[1] ?? text.length) - start <= maximumSegmentCharacters
    ) {
      end = spans[next]?.[1] ?? end;
      next += 1;
    }
    const passage = text.slice(start, end);
    values.push(
      ...segmentsWithinHardLimit(passage, baseOffset + start, blockIdentity),
    );
    start = end;
    while (/\s/.test(text[start] ?? "")) start += 1;
    index = next;
  }
  return values;
}

function segmentsWithinHardLimit(
  passage: string,
  baseOffset: number,
  blockIdentity: string,
) {
  return passage.length > hardMaximumSegmentCharacters
    ? boundedSegments(passage, baseOffset, blockIdentity)
    : [plainSegment(passage, baseOffset, blockIdentity)];
}

function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (
      (text[index] === "." || text[index] === "!" || text[index] === "?") &&
      /\s/.test(text[index + 1] ?? "")
    ) {
      spans.push([start, index + 1]);
      start = index + 1;
    }
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}

function plainSegment(
  text: string,
  baseOffset: number,
  blockIdentity: string,
): RawSegment {
  return {
    blockIdentity,
    passage: text,
    startOffset: baseOffset,
    endOffset: baseOffset + text.length,
    lexicalTerms: lexicalTerms(text),
  };
}

function boundedSegments(
  text: string,
  baseOffset: number,
  blockIdentity: string,
): RawSegment[] {
  const values: RawSegment[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + hardMaximumSegmentCharacters, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start) end = boundary;
    }
    values.push(
      plainSegment(text.slice(start, end), baseOffset + start, blockIdentity),
    );
    start = end;
    while (/\s/.test(text[start] ?? "")) start += 1;
  }
  return values;
}

export function lexicalTerms(text: string) {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (term) => !ignoredTerms.has(term),
  );
}

const ignoredTerms = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "is",
  "of",
  "on",
  "that",
  "the",
  "this",
  "to",
  "what",
  "with",
]);
