import type { LibraryOutputs } from "@/clients/library";

export type Annotation = LibraryOutputs["annotations"]["list"][number];
export type AnnotationColor = Annotation["color"];

export const colors: AnnotationColor[] = ["yellow", "green", "blue", "pink"];

const highlightNames = colors.map((color) => `lirna-annotation-${color}`);

const highlightStyles = colors
  .map(
    (color) =>
      `::highlight(lirna-annotation-${color}) { background-color: var(--annotation-${color}); }`,
  )
  .join("\n");

const draftHighlightName = "lirna-annotation-draft";
export const annotationMenuHeight = 42;
const annotationMenuInset = 8;
const annotationCalloutWidth = 224;
const annotationCalloutGap = 16;
const annotationCalloutInset = 12;

export function annotationStyleContent(color: AnnotationColor) {
  return `${highlightStyles}\n::highlight(${draftHighlightName}) { background-color: var(--annotation-${color}); }`;
}

export interface SelectionDraft {
  startOffset: number;
  endOffset: number;
  exactText: string;
}

export interface MenuPosition {
  left: number;
  top: number;
  below: boolean;
}

export function selectionInside(article: HTMLElement) {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  return article.contains(range.startContainer) &&
    article.contains(range.endContainer)
    ? range
    : undefined;
}

export function rangeOffsets(article: HTMLElement, range: Range) {
  const prefix = document.createRange();
  prefix.selectNodeContents(article);
  prefix.setEnd(range.startContainer, range.startOffset);
  const startOffset = prefix.toString().length;
  return { startOffset, endOffset: startOffset + range.toString().length };
}

export function rangeFromOffsets(
  article: HTMLElement,
  startOffset: number,
  endOffset: number,
) {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset <= startOffset
  ) {
    return undefined;
  }
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let start: { node: Node; offset: number } | undefined;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!start && startOffset <= offset + length) {
      start = { node, offset: startOffset - offset };
    }
    if (start && endOffset <= offset + length) {
      range.setStart(start.node, start.offset);
      range.setEnd(node, endOffset - offset);
      return range;
    }
    offset += length;
    node = walker.nextNode();
  }
  return undefined;
}

export function paintAnnotations(
  article: HTMLElement,
  annotations: Annotation[],
) {
  const registry = customHighlightRegistry();
  const HighlightConstructor = customHighlightConstructor();
  if (!registry || !HighlightConstructor) return undefined;
  for (const name of highlightNames) registry.delete(name);
  for (const color of colors) {
    const ranges = annotations.flatMap((annotation) => {
      if (annotation.color !== color) return [];
      const range = rangeFromOffsets(
        article,
        annotation.startOffset,
        annotation.endOffset,
      );
      return range?.toString() === annotation.exactText ? [range] : [];
    });
    if (ranges.length) {
      registry.set(
        `lirna-annotation-${color}`,
        new HighlightConstructor(...ranges),
      );
    }
  }
  return () => {
    for (const name of highlightNames) registry.delete(name);
  };
}

export function paintDraftSelection(
  article: HTMLElement,
  selection: SelectionDraft,
) {
  const registry = customHighlightRegistry();
  const HighlightConstructor = customHighlightConstructor();
  if (!registry || !HighlightConstructor) return undefined;
  const range = rangeFromOffsets(
    article,
    selection.startOffset,
    selection.endOffset,
  );
  if (!range || range.toString() !== selection.exactText) return undefined;
  registry.set(draftHighlightName, new HighlightConstructor(range));
  return () => {
    registry.delete(draftHighlightName);
  };
}

function customHighlightRegistry() {
  return (
    CSS as typeof CSS & {
      highlights?: {
        set(name: string, value: unknown): void;
        delete(name: string): void;
      };
    }
  ).highlights;
}

function customHighlightConstructor() {
  return (
    window as typeof window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }
  ).Highlight;
}

export function textOffsetAtPoint(article: HTMLElement, x: number, y: number) {
  const modern = (
    document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => {
        offsetNode: Node;
        offset: number;
      } | null;
    }
  ).caretPositionFromPoint?.(x, y);
  const legacy = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint?.(x, y);
  const node = modern?.offsetNode ?? legacy?.startContainer;
  const offset = modern?.offset ?? legacy?.startOffset;
  if (!node || offset === undefined || !article.contains(node)) return -1;
  const prefix = document.createRange();
  try {
    prefix.selectNodeContents(article);
    prefix.setEnd(node, offset);
    return prefix.toString().length;
  } catch {
    return -1;
  }
}

export function menuPosition(rect: DOMRect): MenuPosition {
  const halfWidth = 176;
  const viewportHalfWidth = window.innerWidth / 2;
  const horizontalInset = Math.min(halfWidth, viewportHalfWidth);
  const canPlaceAbove =
    rect.top - annotationMenuInset - annotationMenuHeight >=
    annotationMenuInset;
  const canPlaceBelow =
    rect.bottom + annotationMenuInset + annotationMenuHeight <=
    window.innerHeight;
  const below = !canPlaceAbove || (rect.top < 220 && canPlaceBelow);
  return {
    left: Math.min(
      window.innerWidth - horizontalInset,
      Math.max(horizontalInset, rect.left + rect.width / 2),
    ),
    top: below
      ? Math.min(
          window.innerHeight - annotationMenuInset - annotationMenuHeight,
          Math.max(annotationMenuInset, rect.bottom + annotationMenuInset),
        )
      : rect.top - annotationMenuInset,
    below,
  };
}

export function calloutPosition(
  articleRect: Pick<DOMRect, "left" | "right">,
  viewportWidth: number,
) {
  const right = articleRect.right + annotationCalloutGap;
  if (
    right + annotationCalloutWidth <=
    viewportWidth - annotationCalloutInset
  ) {
    return { left: right, side: "right" as const };
  }

  const left = articleRect.left - annotationCalloutGap - annotationCalloutWidth;
  return left >= annotationCalloutInset
    ? { left, side: "left" as const }
    : undefined;
}
