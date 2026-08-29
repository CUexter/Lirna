import { expect, mock } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { mutationOptions } from "@/test-support/mutationOptions";
import type { CitationResolution } from "../domUtils";
import {
  citationResolutionStyleContent,
  useCitationResolutionHighlights,
} from "../hooks/useCitationResolutionHighlights";
import {
  actions,
  annotationInput,
  calls,
  componentIdentity,
  installCaretAt,
  sourceId,
  stateId,
} from "./support";

await mock.module("@/clients/library", () => ({
  library: {
    citationResolutions: {
      list: {
        key: ({ input }: { input: typeof annotationInput }) => [
          "citation-resolutions",
          input,
        ],
        queryOptions: ({ input }: { input: typeof annotationInput }) => ({
          queryKey: ["citation-resolutions", input],
          queryFn: async () => [],
        }),
      },
    },
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

const { ReadingAnnotations } = await import("../components/Surface");
const { useAnnotationNavigation } = await import("../hooks/useNavigation");
const { createReadingNavigation } = await import("../../navigation/model");
export const { queryClient } = await import("@/infrastructure/queryClient");

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
} from "./support";

export function view() {
  return within(document.body);
}

function AnnotationSurface({
  citationResolutions,
  onOpenCitationResolution,
  unmountAnnotationsOnOpen,
}: {
  citationResolutions?: CitationResolution[];
  onOpenCitationResolution?: (
    entryId: string,
    resolutionId: string,
    bibliographyComponentIdentity: string,
  ) => void;
  unmountAnnotationsOnOpen?: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const navigation = useRef(createReadingNavigation()).current;
  const navigateToAnnotation = useAnnotationNavigation({
    articleRef,
    componentIdentity,
    navigation,
    plainText: "A synthetic Source state passage.",
  });
  useCitationResolutionHighlights({
    articleRef,
    componentIdentity,
    plainText: "A synthetic Source state passage.",
    resolutions: citationResolutions ?? [],
  });
  return (
    <>
      <style>{citationResolutionStyleContent}</style>
      <article ref={articleRef}>A synthetic Source state passage.</article>
      {showAnnotations ? (
        <ReadingAnnotations
          articleRef={articleRef}
          navigateToAnnotation={navigateToAnnotation}
          reading={{
            componentIdentity,
            citationResolutions,
            plainText: "A synthetic Source state passage.",
            sourceId,
            stateId,
          }}
          onOpenCitationResolution={(...arguments_) => {
            onOpenCitationResolution?.(...arguments_);
            if (unmountAnnotationsOnOpen) setShowAnnotations(false);
          }}
        />
      ) : null}
    </>
  );
}

export async function renderAnnotations(
  options: {
    citationResolutions?: CitationResolution[];
    onOpenCitationResolution?: (
      entryId: string,
      resolutionId: string,
      bibliographyComponentIdentity: string,
    ) => void;
    unmountAnnotationsOnOpen?: boolean;
  } = {},
) {
  render(
    <QueryClientProvider client={queryClient}>
      <AnnotationSurface {...options} />
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
