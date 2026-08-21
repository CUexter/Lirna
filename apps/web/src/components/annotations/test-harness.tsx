import { expect, mock } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { useRef } from "react";
import { mutationOptions } from "@/test-support/mutation-options";

import {
  actions,
  annotationInput,
  calls,
  componentIdentity,
  installCaretAt,
  sourceId,
  stateId,
} from "./test-support";

await mock.module("@/clients/library", () => ({
  library: {
    annotations: {
      list: {
        key: ({ input }: { input: typeof annotationInput }) => [
          "annotations",
          input,
        ],
        queryOptions: ({ input }: { input: typeof annotationInput }) => ({
          queryKey: ["annotations", input],
          queryFn: () => actions.list(input),
        }),
      },
      create: { mutationOptions: () => mutationOptions(() => actions.create) },
      update: { mutationOptions: () => mutationOptions(() => actions.update) },
      delete: { mutationOptions: () => mutationOptions(() => actions.remove) },
    },
  },
}));

const { ReadingAnnotations } = await import("./annotations");
export const { queryClient } = await import("@/utils/query-client");

export {
  actions,
  annotation,
  annotationInput,
  calls,
  componentIdentity,
  installCaretAt,
  installHighlightApi,
  resetActions,
  selectExactText,
  setAnnotations,
} from "./test-support";

export function view() {
  return within(document.body);
}

function AnnotationSurface() {
  const articleRef = useRef<HTMLElement>(null);
  return (
    <>
      <article ref={articleRef}>A synthetic Source state passage.</article>
      <ReadingAnnotations
        articleRef={articleRef}
        componentIdentity={componentIdentity}
        plainText="A synthetic Source state passage."
        sourceId={sourceId}
        stateId={stateId}
      />
    </>
  );
}

export async function renderAnnotations() {
  render(
    <QueryClientProvider client={queryClient}>
      <AnnotationSurface />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(calls.list).toEqual([annotationInput]);
    expect(queryClient.isFetching()).toBe(0);
  });
}

export async function openExistingAnnotation() {
  const article = view().getByText("A synthetic Source state passage.");
  const restoreCaret = installCaretAt(article.firstChild as Text);
  await act(async () => {
    window.getSelection()?.removeAllRanges();
    fireEvent.pointerUp(article);
  });
  await waitFor(() =>
    expect(
      view().getByRole("complementary", { name: "Edit annotation" }),
    ).toBeTruthy(),
  );
  restoreCaret();
}
