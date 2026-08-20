import { afterEach, expect, test } from "bun:test";

import type { Annotation } from "./annotation-dom-utils";
import {
  menuPosition,
  paintAnnotations,
  paintDraftSelection,
  rangeFromOffsets,
  rangeOffsets,
  selectionInside,
  textOffsetAtPoint,
} from "./annotation-dom-utils";
import {
  FakeHighlight,
  installHighlightApi,
  restoreProperty,
} from "./annotation-highlight-test-support";

const sourceStateText = "A synthetic Source state preserves nested text.";

function articleWithNestedText() {
  const article = document.createElement("article");
  article.innerHTML =
    "A synthetic <em>Source state</em> preserves nested text.";
  document.body.append(article);
  return article;
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "annotation-1",
    sourceStateId: "state-1",
    componentIdentity: "article",
    startOffset: 2,
    endOffset: 11,
    exactText: "synthetic",
    color: "yellow",
    body: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => window.getSelection()?.removeAllRanges());

test("converts nested Source-state ranges to exact text offsets and back", () => {
  const article = articleWithNestedText();
  const start = article.firstChild as Text;
  const end = article.querySelector("em")?.firstChild as Text;
  const range = document.createRange();
  range.setStart(start, 2);
  range.setEnd(end, 12);

  expect(range.toString()).toBe("synthetic Source state");
  expect(rangeOffsets(article, range)).toEqual({
    startOffset: 2,
    endOffset: 24,
  });

  const restored = rangeFromOffsets(article, 2, 24);
  expect(restored?.toString()).toBe("synthetic Source state");
  expect(rangeFromOffsets(article, 0, sourceStateText.length)?.toString()).toBe(
    sourceStateText,
  );
});

test("rejects invalid offset ranges", () => {
  const article = articleWithNestedText();

  expect(rangeFromOffsets(article, -1, 2)).toBeUndefined();
  expect(rangeFromOffsets(article, 2, 2)).toBeUndefined();
  expect(rangeFromOffsets(article, 9, 2)).toBeUndefined();
  expect(
    rangeFromOffsets(article, 0, sourceStateText.length + 1),
  ).toBeUndefined();
});

test("accepts only non-collapsed selections inside the reading article", () => {
  const article = articleWithNestedText();
  const text = article.firstChild as Text;
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(text, 2);
  range.setEnd(text, 11);
  selection?.addRange(range);
  expect(selectionInside(article)?.toString()).toBe("synthetic");

  selection?.removeAllRanges();
  range.collapse();
  selection?.addRange(range);
  expect(selectionInside(article)).toBeUndefined();

  const crossing = document.createTextNode("outside Source state");
  document.body.append(crossing);
  range.setStart(text, 2);
  range.setEnd(crossing, 7);
  selection?.removeAllRanges();
  selection?.addRange(range);
  expect(selectionInside(article)).toBeUndefined();

  const outside = document.createTextNode("outside Source state");
  document.body.append(outside);
  range.setStart(outside, 0);
  range.setEnd(outside, 7);
  selection?.removeAllRanges();
  selection?.addRange(range);
  expect(selectionInside(article)).toBeUndefined();

  const getSelection = Object.getOwnPropertyDescriptor(window, "getSelection");
  try {
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: undefined,
    });
    expect(selectionInside(article)).toBeUndefined();
  } finally {
    if (getSelection) restoreProperty(window, "getSelection", getSelection);
    else Reflect.deleteProperty(window, "getSelection");
  }
});

test("registers, updates, and cleans annotation and draft highlights", () => {
  const article = articleWithNestedText();
  const { registry, restore } = installHighlightApi();
  try {
    expect(
      (CSS as typeof CSS & { highlights?: unknown }).highlights as unknown,
    ).toBe(registry);
    expect(
      (window as typeof window & { Highlight?: unknown }).Highlight as unknown,
    ).toBe(FakeHighlight);
    const cleanup = paintAnnotations(article, [annotation()]);
    expect(registry.get("lirna-annotation-yellow")?.ranges[0]?.toString()).toBe(
      "synthetic",
    );

    const updatedCleanup = paintAnnotations(article, [
      annotation({ color: "blue" }),
    ]);
    expect(registry.has("lirna-annotation-yellow")).toBe(false);
    expect(registry.get("lirna-annotation-blue")?.ranges[0]?.toString()).toBe(
      "synthetic",
    );

    const draftCleanup = paintDraftSelection(article, {
      startOffset: 2,
      endOffset: 11,
      exactText: "synthetic",
    });
    expect(registry.get("lirna-annotation-draft")?.ranges[0]?.toString()).toBe(
      "synthetic",
    );

    const updatedDraftCleanup = paintDraftSelection(article, {
      startOffset: 12,
      endOffset: 24,
      exactText: "Source state",
    });
    expect(registry.get("lirna-annotation-draft")?.ranges[0]?.toString()).toBe(
      "Source state",
    );

    cleanup?.();
    updatedCleanup?.();
    draftCleanup?.();
    updatedDraftCleanup?.();
    expect(registry.size).toBe(0);
  } finally {
    restore();
  }
});

test("rejects stale text and works without CSS Highlight support", () => {
  const article = articleWithNestedText();
  const { registry, restore } = installHighlightApi();
  try {
    expect(
      paintAnnotations(article, [annotation({ exactText: "stale text" })]),
    ).toBeFunction();
    expect(registry.size).toBe(0);
    expect(
      paintDraftSelection(article, {
        startOffset: 2,
        endOffset: 11,
        exactText: "stale text",
      }),
    ).toBeUndefined();
  } finally {
    restore();
  }

  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { highlights: undefined },
  });
  try {
    expect(paintAnnotations(article, [annotation()])).toBeUndefined();
    expect(
      paintDraftSelection(article, {
        startOffset: 2,
        endOffset: 11,
        exactText: "synthetic",
      }),
    ).toBeUndefined();
  } finally {
    if (css) restoreProperty(globalThis, "CSS", css);
    else Reflect.deleteProperty(globalThis, "CSS");
  }
});

test("looks up text offsets through modern, legacy, invalid, and unavailable carets", () => {
  const article = articleWithNestedText();
  const sourceText = article.firstChild as Text;
  const modern = Object.getOwnPropertyDescriptor(
    document,
    "caretPositionFromPoint",
  );
  const legacy = Object.getOwnPropertyDescriptor(
    document,
    "caretRangeFromPoint",
  );
  try {
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: sourceText, offset: 2 }),
    });
    expect(textOffsetAtPoint(article, 10, 20)).toBe(2);

    Reflect.deleteProperty(document, "caretPositionFromPoint");
    const legacyRange = document.createRange();
    legacyRange.setStart(sourceText, 5);
    legacyRange.collapse();
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: () => legacyRange,
    });
    expect(textOffsetAtPoint(article, 10, 20)).toBe(5);

    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: sourceText, offset: 99 }),
    });
    expect(textOffsetAtPoint(article, 10, 20)).toBe(-1);

    Reflect.deleteProperty(document, "caretPositionFromPoint");
    Reflect.deleteProperty(document, "caretRangeFromPoint");
    expect(textOffsetAtPoint(article, 10, 20)).toBe(-1);
  } finally {
    if (modern) restoreProperty(document, "caretPositionFromPoint", modern);
    else Reflect.deleteProperty(document, "caretPositionFromPoint");
    if (legacy) restoreProperty(document, "caretRangeFromPoint", legacy);
    else Reflect.deleteProperty(document, "caretRangeFromPoint");
  }
});

test("keeps the annotation menu within viewport bounds", () => {
  const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 1000,
  });
  try {
    expect(
      menuPosition({ left: 0, width: 20, top: 100, bottom: 120 } as DOMRect),
    ).toEqual({ left: 176, top: 128, below: true });
    expect(
      menuPosition({ left: 980, width: 20, top: 300, bottom: 320 } as DOMRect),
    ).toEqual({ left: 824, top: 292, below: false });
    expect(
      menuPosition({ left: 490, width: 20, top: 0, bottom: 20 } as DOMRect),
    ).toEqual({ left: 500, top: 28, below: true });
    expect(
      menuPosition({ left: 490, width: 20, top: 980, bottom: 1000 } as DOMRect),
    ).toEqual({ left: 500, top: 972, below: false });
    expect(
      menuPosition({ left: 490, width: 20, top: 0, bottom: 1000 } as DOMRect),
    ).toEqual({ left: 500, top: 950, below: true });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    expect(
      menuPosition({ left: 300, width: 20, top: 100, bottom: 120 } as DOMRect),
    ).toEqual({ left: 160, top: 128, below: true });
  } finally {
    if (innerWidth) restoreProperty(window, "innerWidth", innerWidth);
    if (innerHeight) restoreProperty(window, "innerHeight", innerHeight);
  }
});
