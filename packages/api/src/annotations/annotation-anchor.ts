import type {
  ReadingBlock,
  ReadingComponent,
  ReadingInline,
  ReadingSection,
} from "../sep-admission/sep-reading-contract";

import type { CreateAnnotationInput } from "./annotation-contract";

const annotationContextLength = 32;

export class InvalidAnnotationAnchorError extends Error {
  constructor() {
    super("Annotation anchor does not match the active Reading derivative");
    this.name = "InvalidAnnotationAnchorError";
  }
}

export function validateAnnotationAnchor(
  component: ReadingComponent,
  input: CreateAnnotationInput,
) {
  const { plainText } = component;
  const start = input.normalizedStartOffset;
  const end = input.normalizedEndOffset;
  const valid =
    input.offsetBasis === "normalized-derivative-text-v1" &&
    start >= 0 &&
    end > start &&
    end <= plainText.length &&
    plainText.slice(start, end) === input.exactText &&
    plainText.slice(Math.max(0, start - annotationContextLength), start) ===
      input.prefix &&
    plainText.slice(end, end + annotationContextLength) === input.suffix &&
    (!input.publisherAnchor ||
      publisherAnchorContains(component, input.publisherAnchor, start, end));
  if (!valid) throw new InvalidAnnotationAnchorError();
}

interface AnchorSpan {
  id: string;
  start: number;
  end: number;
}

function publisherAnchorContains(
  component: ReadingComponent,
  id: string,
  start: number,
  end: number,
) {
  const spans = canonicalAnchorSpans(component);
  return spans?.some(
    (span) => span.id === id && span.start <= start && end <= span.end,
  );
}

function canonicalAnchorSpans(component: ReadingComponent) {
  let text = "";
  let chunkCount = 0;
  const spans: AnchorSpan[] = [];
  const append = (chunk: { text: string; spans: AnchorSpan[] }) => {
    if (chunkCount > 0) text += "\n\n";
    const base = text.length;
    text += chunk.text;
    chunkCount += 1;
    spans.push(
      ...chunk.spans.map((span) => ({
        ...span,
        start: span.start + base,
        end: span.end + base,
      })),
    );
  };
  const appendSection = (section: ReadingSection) => {
    const start = text.length + (chunkCount > 0 ? 2 : 0);
    append(inlineChunk(section.title));
    for (const block of section.blocks) append(blockChunk(block));
    for (const child of section.children) appendSection(child);
    spans.push({ id: section.id, start, end: text.length });
  };

  for (const block of component.introductoryBlocks) append(blockChunk(block));
  for (const section of component.sections) appendSection(section);
  return text === component.plainText ? spans : undefined;
}

function blockChunk(block: ReadingBlock): {
  text: string;
  spans: AnchorSpan[];
} {
  if (block.kind === "statement") {
    const label = inlineChunk(block.label);
    const body = inlineChunk(block.body);
    return joinChunks([label, body], " ");
  }
  if (block.kind === "list") {
    return joinChunks(block.items.map(inlineChunk), " ");
  }
  if (block.kind === "table") {
    return joinChunks(
      block.body.flatMap((row) => row.cells.map(inlineChunk)),
      " ",
    );
  }
  if (block.kind === "diagnostic") {
    return { text: block.diagnostic.message, spans: [] };
  }
  if (block.kind === "figure") {
    const chunks = [
      inlineChunk(block.figure.caption),
      inlineChunk(block.figure.description.text),
    ].filter((chunk) => chunk.text.length > 0);
    return joinChunks(chunks, " ");
  }
  return inlineChunk(block.children);
}

function inlineChunk(values: ReadingInline[]): {
  text: string;
  spans: AnchorSpan[];
} {
  const chunks = values.map((value) => {
    if (value.kind === "text") return { text: value.text, spans: [] };
    if (value.kind === "tex") return { text: value.source, spans: [] };
    if (value.kind === "citation") {
      return {
        text: value.label,
        spans: [{ id: value.mentionId, start: 0, end: value.label.length }],
      };
    }
    if (value.kind === "anchor") {
      const chunk = inlineChunk(value.children);
      return {
        ...chunk,
        spans: [
          ...chunk.spans,
          { id: value.id, start: 0, end: chunk.text.length },
        ],
      };
    }
    return inlineChunk(value.children);
  });
  return joinChunks(chunks, "");
}

function joinChunks(
  chunks: Array<{ text: string; spans: AnchorSpan[] }>,
  separator: string,
) {
  let text = "";
  const spans: AnchorSpan[] = [];
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) text += separator;
    const base = text.length;
    text += chunk.text;
    spans.push(
      ...chunk.spans.map((span) => ({
        ...span,
        start: span.start + base,
        end: span.end + base,
      })),
    );
  }
  return { text, spans };
}
