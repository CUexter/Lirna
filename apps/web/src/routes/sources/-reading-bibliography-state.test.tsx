import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
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
    await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
    expect(
      view().queryByRole("textbox", { name: "Annotation note" }),
    ).toBeNull();
    const articleEntry = document.getElementById("article:entry-one");
    expect(articleEntry).not.toBeNull();
    await user.click(
      within(articleEntry as HTMLElement)
        .getAllByRole("button", { name: "Show in article" })
        .at(0) as HTMLElement,
    );
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(returnedTo).toBe("citation-one");
    const restored = await view().findByRole("textbox", {
      name: "Annotation note",
    });
    expect((restored as HTMLTextAreaElement).value).toBe(
      "Unfinished synthesis",
    );
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
    await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });
    expect(
      view().getByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeTruthy();

    expect(
      view().getByText(
        "Synthetic publication content [note 1][note 4][note 7][proposition 1][1]",
      ),
    ).toBeTruthy();
    const articleEntry = document.getElementById("article:entry-one");
    expect(articleEntry).not.toBeNull();
    await user.click(
      within(articleEntry as HTMLElement)
        .getAllByRole("button", { name: "Show in article" })
        .at(0) as HTMLElement,
    );
    expect(router.state.location.search).toEqual({
      component: "article",
    });
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(returnedTo).toBe("citation-one");
    expect(
      document
        .getElementById("citation-one")
        ?.classList.contains("authored-target-highlight"),
    ).toBe(true);
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("opens and focuses a Citation on the first click", async () => {
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const originalWindowScrollTo = window.scrollTo;
  let browserScrollRequests = 0;
  let articleScrollRequests = 0;
  let panelScrollRequests = 0;
  let pageScrollRequests = 0;
  HTMLElement.prototype.scrollIntoView = function () {
    if (this.closest('[aria-label="Reading tools"]'))
      browserScrollRequests += 1;
    else articleScrollRequests += 1;
  };
  HTMLElement.prototype.scrollTo = function () {
    if (this.closest('[aria-label="Reading tools"]')) panelScrollRequests += 1;
  };
  try {
    const router = await renderReading("?component=article");
    const citation = await view().findByRole("button", {
      name: "Citation: [1] (resolved)",
    });
    expect(
      view()
        .getByRole("tab", { name: "Contents" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    window.scrollTo = () => {
      pageScrollRequests += 1;
    };
    await user.click(citation);
    const articleEntry = document.getElementById("article:entry-one");
    expect(articleEntry).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(articleEntry));
    expect(
      view()
        .getByRole("tab", { name: "Bibliography" })
        .getAttribute("aria-selected"),
    ).toBe("true");

    expect(browserScrollRequests).toBe(0);
    expect(panelScrollRequests).toBeGreaterThan(0);
    expect(pageScrollRequests).toBe(0);
    const previousPanelScrollRequests = panelScrollRequests;
    const bibliography = view().getByRole("region", { name: "Bibliography" });
    if (!(bibliography.parentElement instanceof HTMLElement))
      throw new Error("Missing Bibliography scroll container");
    bibliography.parentElement.scrollTop = 500;

    await user.click(citation);
    await waitFor(() => {
      expect(panelScrollRequests).toBeGreaterThan(previousPanelScrollRequests);
      expect(document.activeElement).toBe(articleEntry);
    });
    expect(browserScrollRequests).toBe(0);
    articleScrollRequests = 0;
    await user.click(view().getByRole("tab", { name: "Contents" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ component: "article" }),
    );
    expect(articleScrollRequests).toBe(0);
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    window.scrollTo = originalWindowScrollTo;
  }
});

test("keeps the Reading tools panel persistent and changes views with tabs", async () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => undefined;
  try {
    const router = await renderReading(
      "?component=article&view=bibliography&citation=entry-one",
    );
    await view().findByRole("complementary", {
      name: "Reading tools",
    });
    expect(view().getByText("A synthetic Source state passage.")).toBeTruthy();

    const panel = view().getByRole("complementary", { name: "Reading tools" });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(view().getByRole("complementary", { name: "Reading tools" })).toBe(
      panel,
    );
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });

    fireEvent.click(view().getByRole("tab", { name: "Contents" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ component: "article" }),
    );
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});
