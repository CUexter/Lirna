import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { act, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      assistant: {
        ask: {
          mutationOptions: () => ({
            mutationFn: async () => ({ answer: "Synthetic answer." }),
          }),
        },
      },
      reading: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading", input],
          queryFn: async () => readingFixture(),
        }),
      },
      resume: {
        get: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["resume", input],
            queryFn: async () => null,
          }),
        },
        save: {
          mutationOptions: () => ({ mutationFn: async () => undefined }),
        },
      },
    },
  },
}));

await mock.module("@/clients/library", () => ({
  library: {
    annotations: {
      list: {
        key: ({ input }: { input: unknown }) => ["annotations", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["annotations", input],
          queryFn: async () => [],
        }),
      },
      create: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      update: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
    },
  },
}));

const { Route } = await import("./$sourceId/$stateId");

function view() {
  return within(document.body);
}

afterEach(cleanup);

async function renderReading(search = "") {
  const rootRoute = createRootRoute();
  const readingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/$sourceId/$stateId",
    component: Route.options.component,
    validateSearch: Route.options.validateSearch,
  });
  return renderRoute(
    rootRoute.addChildren([readingRoute]),
    `/sources/${sourceId}/${stateId}${search}`,
  );
}

test("restores an unfinished annotation draft after visiting a Citation", async () => {
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let returnedTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    returnedTo = this.id;
  };
  try {
    await renderReading("?component=article");
    localStorage.clear();
    const passage = await view().findByText(
      "A synthetic Source state passage.",
    );
    const text = passage.firstChild;
    if (!(text instanceof Text)) throw new Error("Missing passage text");
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 11);
    await act(async () => {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await user.click(await view().findByRole("button", { name: "Add note" }));
    const note = view().getByRole("textbox", { name: "Annotation note" });
    await user.type(note, "Unfinished synthesis");
    await waitFor(() =>
      expect(
        localStorage.getItem(
          `lirna:annotation-draft:${sourceId}:${stateId}:article`,
        ),
      ).toContain("Unfinished synthesis"),
    );

    await user.click(
      view().getByRole("button", { name: "Citation: [1] (resolved)" }),
    );
    await waitFor(() => view().getByRole("heading", { name: "Bibliography" }));
    expect(
      view().queryByRole("textbox", { name: "Annotation note" }),
    ).toBeNull();
    await user.click(view().getByRole("button", { name: "Back to citation" }));

    const restored = await view().findByRole("textbox", {
      name: "Annotation note",
    });
    expect((restored as HTMLTextAreaElement).value).toBe(
      "Unfinished synthesis",
    );
    expect(returnedTo).toBe("citation-one");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("restores bibliography and Citation context from route search", async () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let returnedTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    returnedTo = this.id;
  };
  try {
    const user = userEvent.setup();
    const router = await renderReading(
      "?component=article&view=bibliography&citation=entry-one",
    );
    await waitFor(() => view().getByRole("heading", { name: "Bibliography" }));
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });
    expect(
      view().getByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeTruthy();

    await user.click(view().getByRole("button", { name: "Back to citation" }));
    await waitFor(() =>
      view().getByRole("button", { name: "Citation: [1] (resolved)" }),
    );
    expect(router.state.location.search).toEqual({ component: "article" });
    expect(returnedTo).toBe("citation-one");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});
