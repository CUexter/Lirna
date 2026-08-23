import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";

import {
  readingFixture,
  sourceId,
  stateId,
} from "@/routes/sources/-reading-test-fixtures";

let resolveResume!: (value: unknown) => void;
let resumeStarted = false;

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      resume: {
        get: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["navigation-resume", input],
            queryFn: () => {
              resumeStarted = true;
              return new Promise((resolve) => {
                resolveResume = resolve;
              });
            },
          }),
        },
        save: {
          mutationOptions: () => ({ mutationFn: async () => undefined }),
        },
      },
    },
  },
}));

const { useReadingNavigationObservations } = await import(
  "./navigation-observer"
);
const { useReadingNavigationScope } = await import(
  "./reading-navigation-hooks"
);
const { useReadingResume } = await import("./reading-resume");

function Harness() {
  const component = readingFixture().components[0];
  const { articleRef, navigation, toolsScrollRef } =
    useReadingNavigationScope();
  useReadingNavigationObservations({
    componentIdentity: component.identity,
    navigation,
    toolsScrollRef,
    view: "article",
  });
  useReadingResume({
    articleRef,
    component,
    ephemeralScrollTop: undefined,
    navigation,
    sourceId,
    stateId,
  });
  return (
    <>
      <article ref={articleRef} />
      <div ref={toolsScrollRef} />
    </>
  );
}

test("reader control cancels a pending resume before it resolves", async () => {
  resumeStarted = false;
  const locations: ScrollToOptions[] = [];
  const originalScrollTo = window.scrollTo;
  window.scrollTo = (options) => {
    if (typeof options === "object") locations.push(options);
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  try {
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(resumeStarted).toBe(true));
    window.dispatchEvent(new WheelEvent("wheel"));
    resolveResume({
      sourceId,
      stateId,
      componentIdentity: "article",
      componentLabel: "Article",
      scrollTop: 640,
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(locations).toEqual([]);
  } finally {
    window.scrollTo = originalScrollTo;
  }
});
