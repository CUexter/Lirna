import type { ReadingBlock, ReadingInline, ReadingSection } from "./types";

interface PublisherAnchorSpan {
  id: string;
  start: number;
  end: number;
}

interface TextChunk {
  text: string;
  spans: PublisherAnchorSpan[];
}

interface ProjectionPolicy {
  includeEmptyChunks: boolean;
  includeDiagnostics: boolean;
  includeTableApparatus: boolean;
  trimFigureText: boolean;
}

const currentPolicy: ProjectionPolicy = {
  includeEmptyChunks: false,
  includeDiagnostics: false,
  includeTableApparatus: true,
  trimFigureText: false,
};

const versionOnePolicy: ProjectionPolicy = {
  includeEmptyChunks: true,
  includeDiagnostics: true,
  includeTableApparatus: false,
  trimFigureText: true,
};

export function projectReadingArticle(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
) {
  return project(introductoryBlocks, sections, currentPolicy);
}

export function projectVersionOneReadingArticle(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
) {
  return project(introductoryBlocks, sections, versionOnePolicy);
}

function project(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
  policy: ProjectionPolicy,
) {
  let text = "";
  let chunkCount = 0;
  const publisherAnchorSpans: PublisherAnchorSpan[] = [];
  const append = (chunk: TextChunk) => {
    if (!policy.includeEmptyChunks && !chunk.text) return undefined;
    if (chunkCount > 0) text += "\n\n";
    const start = text.length;
    text += chunk.text;
    chunkCount += 1;
    publisherAnchorSpans.push(
      ...chunk.spans.map((span) => ({
        ...span,
        start: span.start + start,
        end: span.end + start,
      })),
    );
    return start;
  };
  const appendSection = (section: ReadingSection): number | undefined => {
    let start = append(inlineChunk(section.title, policy));
    for (const block of section.blocks) {
      const blockStart = append(blockChunk(block, policy));
      start ??= blockStart;
    }
    for (const child of section.children) {
      const childStart = appendSection(child);
      start ??= childStart;
    }
    if (start !== undefined && text.length > start) {
      publisherAnchorSpans.push({ id: section.id, start, end: text.length });
    }
    return start;
  };

  for (const block of introductoryBlocks) append(blockChunk(block, policy));
  for (const section of sections) appendSection(section);
  return { text, publisherAnchorSpans };
}

function blockChunk(block: ReadingBlock, policy: ProjectionPolicy): TextChunk {
  const chunk = blockContentChunk(block, policy);
  if (!chunk.text) return chunk;
  return {
    ...chunk,
    spans: chunk.spans.map((span) =>
      span.start === 0 && span.end === 0
        ? { ...span, end: chunk.text.length }
        : span,
    ),
  };
}

function blockContentChunk(
  block: ReadingBlock,
  policy: ProjectionPolicy,
): TextChunk {
  if (block.kind === "statement") {
    return joinChunks(
      [inlineChunk(block.label, policy), inlineChunk(block.body, policy)],
      " ",
      policy,
    );
  }
  if (block.kind === "list") {
    return joinChunks(
      block.items.map((item) => inlineChunk(item, policy)),
      " ",
      policy,
    );
  }
  if (block.kind === "table") {
    const rows = policy.includeTableApparatus
      ? [
          block.caption,
          ...[...block.head, ...block.body].flatMap(({ cells }) => cells),
        ]
      : block.body.flatMap(({ cells }) => cells);
    return joinChunks(
      rows.map((row) => inlineChunk(row, policy)),
      " ",
      policy,
    );
  }
  if (block.kind === "figure") {
    const figurePolicy = { ...policy, includeEmptyChunks: false };
    const joined = joinChunks(
      [
        inlineChunk(block.figure.caption, figurePolicy),
        inlineChunk(block.figure.description.text, figurePolicy),
      ],
      " ",
      figurePolicy,
    );
    const chunk = policy.trimFigureText ? trimChunk(joined) : joined;
    return chunk.text
      ? {
          ...chunk,
          spans: [
            ...chunk.spans,
            { id: block.figure.id, start: 0, end: chunk.text.length },
          ],
        }
      : chunk;
  }
  if (block.kind === "diagnostic") {
    return {
      text: policy.includeDiagnostics ? block.diagnostic.message : "",
      spans: [],
    };
  }
  return inlineChunk(block.children, policy);
}

function trimChunk(chunk: TextChunk): TextChunk {
  const text = chunk.text.trim();
  const removedStart = chunk.text.length - chunk.text.trimStart().length;
  return {
    text,
    spans: chunk.spans.map((span) => ({
      ...span,
      start: Math.max(0, Math.min(text.length, span.start - removedStart)),
      end: Math.max(0, Math.min(text.length, span.end - removedStart)),
    })),
  };
}

function inlineChunk(
  values: ReadingInline[],
  policy: ProjectionPolicy,
): TextChunk {
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
      const chunk = inlineChunk(value.children, policy);
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
    policy,
  );
}

function joinChunks(
  chunks: TextChunk[],
  separator: string,
  policy: ProjectionPolicy,
): TextChunk {
  let text = "";
  let chunkCount = 0;
  const spans: PublisherAnchorSpan[] = [];
  for (const chunk of chunks) {
    if (!policy.includeEmptyChunks && !chunk.text) {
      spans.push(
        ...chunk.spans.map((span) => ({
          ...span,
          start: span.start + text.length,
          end: span.end + text.length,
        })),
      );
      continue;
    }
    if (chunkCount > 0) text += separator;
    const start = text.length;
    text += chunk.text;
    chunkCount += 1;
    spans.push(
      ...chunk.spans.map((span) => ({
        ...span,
        start: span.start + start,
        end: span.end + start,
      })),
    );
  }
  return { text, spans };
}
