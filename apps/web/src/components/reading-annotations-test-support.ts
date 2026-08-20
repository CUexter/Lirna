import type { QueryClient } from "@tanstack/react-query";
import { act, waitFor, within } from "@testing-library/react";

import type { Annotation } from "./annotation-dom-utils";

export const sourceId = "source-1";
export const stateId = "state-1";
export const componentIdentity = "article";
export const annotationInput = { sourceId, stateId };

export const calls = {
  create: [] as unknown[],
  delete: [] as unknown[],
  list: [] as unknown[],
  update: [] as unknown[],
};

export const actions: {
  create: (input: unknown) => Promise<unknown>;
  list: (input: unknown) => Promise<Annotation[]>;
  remove: (input: unknown) => Promise<unknown>;
  update: (input: unknown) => Promise<unknown>;
} = {
  create: async () => undefined,
  list: async () => annotations,
  remove: async () => undefined,
  update: async () => undefined,
};

let annotations: Annotation[] = [];

export function mutationOptions<TInput>(
  getAction: () => (input: TInput) => Promise<unknown>,
) {
  return { mutationFn: (input: TInput) => getAction()(input) };
}

export function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "annotation-1",
    sourceStateId: stateId,
    componentIdentity,
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

export function setAnnotations(next: Annotation[]) {
  annotations = next;
}

export function resetActions(queryClient: QueryClient) {
  queryClient.clear();
  queryClient.setDefaultOptions({
    mutations: { retry: false },
    queries: { retry: false },
  });
  for (const values of Object.values(calls)) values.length = 0;
  annotations = [];
  actions.list = async (input) => {
    calls.list.push(input);
    return annotations;
  };
  actions.create = async (input) => {
    calls.create.push(input);
  };
  actions.update = async (input) => {
    calls.update.push(input);
  };
  actions.remove = async (input) => {
    calls.delete.push(input);
  };
}

export function installCaretAt(node: Node) {
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    "caretPositionFromPoint",
  );
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: node, offset: 5 }),
  });
  return () => {
    if (descriptor)
      Object.defineProperty(document, "caretPositionFromPoint", descriptor);
    else Reflect.deleteProperty(document, "caretPositionFromPoint");
  };
}

export async function selectExactText() {
  const article = within(document.body).getByText(
    "A synthetic Source state passage.",
  );
  const range = document.createRange();
  range.setStart(article.firstChild as Text, 2);
  range.setEnd(article.firstChild as Text, 11);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  await act(async () => document.dispatchEvent(new Event("selectionchange")));
  await waitFor(() =>
    within(document.body).getByRole("dialog", { name: "Create annotation" }),
  );
}

class FakeHighlight {
  readonly ranges: Range[];

  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

export function installHighlightApi() {
  const registry = new Map<string, FakeHighlight>();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const highlight = Object.getOwnPropertyDescriptor(window, "Highlight");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { highlights: registry },
  });
  Object.defineProperty(window, "Highlight", {
    configurable: true,
    value: FakeHighlight,
  });
  return {
    registry,
    restore: () => {
      if (css) Object.defineProperty(globalThis, "CSS", css);
      else Reflect.deleteProperty(globalThis, "CSS");
      if (highlight) Object.defineProperty(window, "Highlight", highlight);
      else Reflect.deleteProperty(window, "Highlight");
    },
  };
}
