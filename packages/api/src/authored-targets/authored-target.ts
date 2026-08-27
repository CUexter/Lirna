import { z } from "zod";

import type {
  ReadingBlock,
  ReadingComponent,
  ReadingInline,
  ReadingSection,
} from "../sep-admission/sep-reading-contract";

export const authoredTargetOffsetBasis =
  "normalized-derivative-text-v1" as const;

export interface AuthoredTarget {
  publisherAnchor: string | null;
  offsetBasis: typeof authoredTargetOffsetBasis;
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
}

export interface AuthoredTargetInput
  extends Omit<AuthoredTarget, "publisherAnchor"> {
  publisherAnchor?: string;
}

const authoredTargetShape = {
  offsetBasis: z.literal(authoredTargetOffsetBasis),
  normalizedStartOffset: z.number().int().nonnegative(),
  normalizedEndOffset: z.number().int().positive(),
  exactText: z.string(),
  prefix: z.string(),
  suffix: z.string(),
};

export const authoredTargetSchema = z.object({
  publisherAnchor: z.string().nullable(),
  ...authoredTargetShape,
});

export const authoredTargetInputSchema = z
  .object({
    publisherAnchor: z.string().trim().min(1).max(2_000).optional(),
    ...authoredTargetShape,
    exactText: z.string().min(1).max(20_000),
    prefix: z.string().max(32),
    suffix: z.string().max(32),
  })
  .refine(
    (target) => target.normalizedEndOffset > target.normalizedStartOffset,
    {
      message: "Authored target end offset must follow its start offset",
      path: ["normalizedEndOffset"],
    },
  )
  .refine(
    (target) =>
      target.normalizedEndOffset - target.normalizedStartOffset ===
      target.exactText.length,
    {
      message: "Authored target range must match its exact text",
      path: ["exactText"],
    },
  );

const contextLength = 32;

export class InvalidAuthoredTargetError extends Error {
  constructor(reason = "Authored target") {
    super(`${reason} does not match the active Reading derivative`);
    this.name = "InvalidAuthoredTargetError";
  }
}

export function validateAuthoredTarget(
  component: ReadingComponent,
  target: AuthoredTarget | AuthoredTargetInput,
) {
  const { plainText } = component;
  const start = target.normalizedStartOffset;
  const end = target.normalizedEndOffset;
  if (target.offsetBasis !== authoredTargetOffsetBasis) {
    throw new InvalidAuthoredTargetError("Authored target offset basis");
  }
  if (start < 0 || end <= start || end > plainText.length) {
    throw new InvalidAuthoredTargetError("Authored target offsets");
  }
  if (plainText.slice(start, end) !== target.exactText) {
    throw new InvalidAuthoredTargetError("Authored target text");
  }
  if (
    plainText.slice(Math.max(0, start - contextLength), start) !== target.prefix
  ) {
    throw new InvalidAuthoredTargetError("Authored target prefix");
  }
  if (plainText.slice(end, end + contextLength) !== target.suffix) {
    throw new InvalidAuthoredTargetError("Authored target suffix");
  }
  if (
    target.publisherAnchor &&
    !publisherAnchorContains(component, target.publisherAnchor, start, end)
  ) {
    throw new InvalidAuthoredTargetError("Publisher anchor");
  }
}

export function authoredTargetForPublisherAnchor(
  component: ReadingComponent,
  publisherAnchor: string,
): AuthoredTarget {
  const span = canonicalAnchorSpans(component)?.find(
    (candidate) => candidate.id === publisherAnchor,
  );
  if (!span) throw new InvalidAuthoredTargetError("Publisher anchor");
  return {
    publisherAnchor,
    offsetBasis: authoredTargetOffsetBasis,
    normalizedStartOffset: span.start,
    normalizedEndOffset: span.end,
    exactText: component.plainText.slice(span.start, span.end),
    prefix: component.plainText.slice(
      Math.max(0, span.start - contextLength),
      span.start,
    ),
    suffix: component.plainText.slice(span.end, span.end + contextLength),
  };
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
  return canonicalAnchorSpans(component)?.some(
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
    return joinChunks([inlineChunk(block.label), inlineChunk(block.body)], " ");
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
    return joinChunks(
      [
        inlineChunk(block.figure.caption),
        inlineChunk(block.figure.description.text),
      ].filter((chunk) => chunk.text.length > 0),
      " ",
    );
  }
  return inlineChunk(block.children);
}

function inlineChunk(values: ReadingInline[]): {
  text: string;
  spans: AnchorSpan[];
} {
  return joinChunks(
    values.map((value) => {
      if (value.kind === "text") return { text: value.text, spans: [] };
      if (value.kind === "tex") return { text: value.source, spans: [] };
      if (value.kind === "citation") {
        return {
          text: value.label,
          spans: [{ id: value.mentionId, start: 0, end: value.label.length }],
        };
      }
      const chunk = inlineChunk(value.children);
      return value.kind === "anchor"
        ? {
            ...chunk,
            spans: [
              ...chunk.spans,
              { id: value.id, start: 0, end: chunk.text.length },
            ],
          }
        : chunk;
    }),
    "",
  );
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
