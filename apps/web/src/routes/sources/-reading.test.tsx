// biome-ignore lint/style/noExcessiveLinesPerFile: Route-level reading behaviors share one mocked module and router harness.
import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { act, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";

const calls = {
  annotations: [] as unknown[],
  reading: [] as unknown[],
};
let getReading: (input: unknown) => Promise<unknown> = async () =>
  readingFixture();
let annotations: unknown[] = [];

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
          queryFn: () => getReading(input),
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
          mutationOptions: () => ({
            mutationFn: async () => undefined,
          }),
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
          queryFn: async () => {
            calls.annotations.push(input);
            return annotations;
          },
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

function resetActions() {
  calls.annotations.length = 0;
  calls.reading.length = 0;
  annotations = [];
  getReading = async (input) => {
    calls.reading.push(input);
    return readingFixture();
  };
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

test("shows Reading loading and unavailable states through its route", async () => {
  resetActions();
  let resolveReading: (value: unknown) => void = () => undefined;
  getReading = (input) => {
    calls.reading.push(input);
    return new Promise((resolve) => {
      resolveReading = resolve;
    });
  };
  await renderReading();
  expect(view().getByText("Loading Reading workspace…")).toBeTruthy();
  await act(async () => resolveReading(readingFixture()));
  await waitFor(() => view().getByRole("heading", { level: 1 }));
  expect(calls.reading).toEqual([{ sourceId, stateId }]);

  cleanup();
  resetActions();
  getReading = async (input) => {
    calls.reading.push(input);
    throw new Error("Synthetic Reading data is unavailable");
  };
  await renderReading();
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Synthetic Reading data is unavailable",
    ),
  );
  expect(view().getByText("Reading workspace unavailable")).toBeTruthy();
});

test("renders source-state scholarly apparatus and navigates components", async () => {
  resetActions();
  const user = userEvent.setup();
  const router = await renderReading();
  await waitFor(() =>
    expect(view().getByRole("heading", { level: 1 }).textContent).toBe(
      "Synthetic Reading Source",
    ),
  );

  expect(view().getByText("Ada Lovelace, Grace Hopper")).toBeTruthy();
  expect(view().getByText("Synthetic Publisher")).toBeTruthy();
  expect(view().getByText("Capture and rendering status")).toBeTruthy();
  expect(view().getByText("Synthetic capture warning.")).toBeTruthy();
  expect(view().getByText("Synthetic figure")).toBeTruthy();
  expect(view().getAllByText("Synthetic figure")).toHaveLength(1);
  expect(
    view().getByText("Rendering note: missing-semantic-asset"),
  ).toBeTruthy();
  const figure = document.getElementById("synthetic-figure");
  const followingParagraph = view().getByText("After the synthetic figure.");
  expect(figure?.compareDocumentPosition(followingParagraph) ?? 0).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  await waitFor(() =>
    expect(
      view().getByText("Reading position synced for Article"),
    ).toBeTruthy(),
  );
  expect(calls.annotations).toEqual([{ sourceId, stateId }]);
  expect(
    within(
      view().getByRole("navigation", { name: "Component contents" }),
    ).queryByRole("button", { name: "Bibliography" }),
  ).toBeNull();
  expect(
    within(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).getByRole("tab", { name: "Bibliography" }),
  ).toBeTruthy();

  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await user.click(view().getByRole("button", { name: "Supplement one" }));
  await waitFor(() => view().getByText("First supplement content."));
  expect(view().queryByText("Synthetic figure")).toBeNull();
  expect(router.state.location.search).toEqual({ component: "supplement-one" });
  await user.click(
    view().getByRole("button", { name: "Next: Supplement two" }),
  );
  await waitFor(() => view().getByText("Second supplement content."));
  await user.click(
    view().getByRole("button", { name: "Previous: Supplement one" }),
  );
  await waitFor(() => view().getByText("First supplement content."));
  await user.click(
    view().getByRole("button", { name: "Synthetic Reading Source" }),
  );
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(router.state.location.search).toEqual({ component: "article" });

  await user.click(view().getByRole("tab", { name: "Bibliography" }));
  await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
  expect(view().getByText("Supplement bibliography entry.")).toBeTruthy();
  expect(
    view()
      .getByRole("navigation", { name: "Bibliography by author" })
      .querySelector("details")?.open,
  ).toBe(false);
  expect(router.state.location.search).toEqual({
    component: "article",
    view: "bibliography",
  });
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await user.click(view().getByRole("button", { name: "Supplement one" }));
  await waitFor(() => view().getByText("First supplement content."));
  expect(router.state.location.search).toEqual({ component: "supplement-one" });
});

test("returns from a bibliography mention in another Source component", async () => {
  resetActions();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let returnedTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    returnedTo = this.id;
  };
  try {
    const user = userEvent.setup();
    const router = await renderReading("?component=article");
    await waitFor(() => view().getByText("A synthetic Source state passage."));

    await user.click(view().getByRole("tab", { name: "Bibliography" }));
    const entry = view()
      .getByText("Supplement bibliography entry.")
      .closest("li");
    expect(entry).not.toBeNull();
    await user.click(
      within(entry as HTMLElement).getByRole("button", {
        name: "Show in article",
      }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        component: "supplement-one",
      }),
    );
    await waitFor(() => expect(returnedTo).toBe("supplement-citation-one"));
    expect(
      document
        .getElementById("supplement-citation-one")
        ?.classList.contains("authored-target-highlight"),
    ).toBe(true);
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("opens an existing note from the Reading tools panel", async () => {
  resetActions();
  const firstAnnotation = {
    id: "annotation-1",
    sourceId,
    sourceStateId: stateId,
    componentIdentity: "article",
    kind: "note",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 2,
    normalizedEndOffset: 11,
    exactText: "synthetic",
    prefix: "A ",
    suffix: " Source state passage.",
    color: "yellow",
    body: "A durable note.",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
  annotations = [
    firstAnnotation,
    {
      ...firstAnnotation,
      id: "annotation-2",
      body: "A second durable note.",
    },
  ];
  const user = userEvent.setup();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  await user.click(view().getByRole("tab", { name: "Notes" }));
  await user.click(view().getByRole("button", { name: /A durable note/ }));

  await waitFor(() =>
    expect(
      view().getByRole("complementary", { name: "Edit annotation" }),
    ).toBeTruthy(),
  );
  expect(
    (view().getByLabelText("Annotation note") as HTMLTextAreaElement).value,
  ).toBe("A durable note.");

  await user.click(
    view().getByRole("button", { name: /A second durable note/ }),
  );
  await waitFor(() =>
    expect(
      (view().getByLabelText("Annotation note") as HTMLTextAreaElement).value,
    ).toBe("A second durable note."),
  );
});

test("shows an unavailable component instead of substituting the article", async () => {
  resetActions();
  const user = userEvent.setup();
  const router = await renderReading("?component=missing-supplement");
  await waitFor(() =>
    expect(
      view().getByRole("heading", { name: "Component unavailable" }),
    ).toBeTruthy(),
  );
  expect(view().getByText("missing-supplement")).toBeTruthy();
  expect(view().queryByText("A synthetic Source state passage.")).toBeNull();

  await user.click(view().getByRole("button", { name: "Open main article" }));
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(router.state.location.search).toEqual({ component: "article" });
});

test("scrolls automatic section references and opens numbered references", async () => {
  resetActions();
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let scrolledTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    scrolledTo = this.id;
  };
  try {
    await renderReading("?component=article");
    await waitFor(() =>
      expect(view().getByRole("button", { name: "Reference §2" })).toBeTruthy(),
    );

    await user.click(view().getByRole("button", { name: "Reference §2" }));
    expect(scrolledTo).toBe("referenced-claim");
    expect(view().queryByText("Reference context")).toBeNull();

    await user.click(view().getByRole("button", { name: "Reference §2.1" }));
    expect(scrolledTo).toBe("nested-claim");
    await user.click(view().getByRole("button", { name: "Reference §2.1.1" }));
    expect(scrolledTo).toBe("deeply-nested-claim");

    await user.click(view().getByRole("button", { name: "Reference (1)" }));
    const numberedTool = view().getByRole("complementary", {
      name: "Reading tools",
    });
    expect(
      within(numberedTool).getByText("Numbered statement (1)"),
    ).toBeTruthy();
    await user.click(
      within(numberedTool).getByRole("button", { name: "Show in article" }),
    );
    expect(scrolledTo).toBe("reading-reference-number-1");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("previews authored fragment references before scrolling to them", async () => {
  resetActions();
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let scrolledTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    scrolledTo = this.id;
  };
  try {
    await renderReading("?component=article");

    await user.click(await view().findByRole("link", { name: "Poss" }));
    const referenceTool = view().getByRole("complementary", {
      name: "Reading tools",
    });
    expect(within(referenceTool).getByText("Poss")).toBeTruthy();
    expect(referenceTool.textContent).toContain(
      "Synthetic publication content",
    );
    expect(scrolledTo).toBeUndefined();

    await user.click(view().getByRole("link", { name: "Ness" }));
    expect(within(referenceTool).getByText("Ness")).toBeTruthy();
    expect(scrolledTo).toBeUndefined();

    await user.click(
      within(referenceTool).getByRole("button", { name: "Show in article" }),
    );
    expect(scrolledTo).toBe("Ness");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("clears component-local fragments when switching components", async () => {
  resetActions();
  const user = userEvent.setup();
  let scrolledTo: string | undefined;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function () {
    scrolledTo = this.id;
  };
  const router = await renderReading("?component=article#Poss");
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(scrolledTo).toBe("Poss");
  expect(router.state.location.hash).toBe("Poss");
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;

  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await user.click(view().getByRole("button", { name: "Supplement one" }));
  await waitFor(() => view().getByText("First supplement content."));
  expect(router.state.location.hash).toBe("");
});

test("filters publisher bibliography and preserves component search when returning from a Citation", async () => {
  resetActions();
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let returnedTo: string | undefined;
  HTMLElement.prototype.scrollIntoView = function () {
    returnedTo = this.id;
  };
  try {
    const router = await renderReading("?component=article");
    await waitFor(() =>
      expect(
        view().getByRole("button", { name: "Citation: [1] (resolved)" }),
      ).toBeTruthy(),
    );
    await user.click(
      view().getByRole("button", { name: "Citation: [1] (resolved)" }),
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
    expect(document.getElementById("article:entry-one")?.className).toContain(
      "border-primary",
    );
    expect(
      document.getElementById("article:entry-one")?.closest("details")?.open,
    ).toBe(true);
    await user.type(view().getByLabelText("Search bibliography"), "hopper");
    expect(
      view().queryByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeNull();
    expect(
      view().getByText("Grace Hopper. Another publisher entry."),
    ).toBeTruthy();
    const search = view().getByLabelText("Search bibliography");
    await user.click(search);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await waitFor(() =>
      expect(
        view().getByText("Ada Lovelace. Synthetic publisher entry."),
      ).toBeTruthy(),
    );
    expect(
      view().getByText(
        "Synthetic publication content [note 1][note 4][note 7][proposition 1][1]",
      ),
    ).toBeTruthy();
    const selectedEntry = document.getElementById("article:entry-one");
    expect(selectedEntry).not.toBeNull();
    await user.click(
      within(selectedEntry as HTMLElement)
        .getAllByRole("button", { name: "Show in article" })
        .at(0) as HTMLElement,
    );
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(router.state.location.search).toEqual({
      component: "article",
    });
    expect(returnedTo).toBe("citation-one");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("opens publisher notes beside the article and follows their backlinks", async () => {
  resetActions();
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let scrolledTo: string | undefined;
  let scrollBlock: ScrollLogicalPosition | undefined;
  HTMLElement.prototype.scrollIntoView = function (options) {
    scrolledTo = this.id;
    scrollBlock = typeof options === "object" ? options.block : undefined;
    if (this.closest('[aria-label="Reading tools"]')) window.scrollTo(0, 0);
  };
  try {
    const router = await renderReading("?component=article");
    await waitFor(() => view().getByText("[note 1]"));
    await user.click(view().getByText("[proposition 1]"));
    await waitFor(() => expect(scrolledTo).toBe("proposition-1"));
    expect(scrollBlock).toBe("center");
    const highlightedTarget =
      document.getElementById("proposition-1")?.parentElement;
    expect(
      highlightedTarget?.classList.contains("authored-target-highlight"),
    ).toBe(true);
    highlightedTarget?.dispatchEvent(new Event("animationend"));
    expect(
      highlightedTarget?.classList.contains("authored-target-highlight"),
    ).toBe(false);
    window.scrollTo(0, 640);
    await user.click(view().getByText("[note 1]"));
    const notes = await waitFor(() =>
      view().getByRole("complementary", { name: "Reading tools" }),
    );
    expect(notes.textContent).toContain("Publisher-authored note.");
    expect(document.querySelectorAll("article")).toHaveLength(2);
    expect(
      notes
        .querySelector("[data-reading-scroll-owner]")
        ?.getAttribute("data-reading-scroll-owner"),
    ).toBe("publisher-note");
    expect(window.scrollY).toBe(640);
    expect(router.state.location.search).toEqual({ component: "article" });
    await user.click(view().getByText("[note 4]"));
    await waitFor(() => expect(document.getElementById("4")).toBeTruthy());
    await waitFor(() =>
      expect(
        document
          .getElementById("4")
          ?.parentElement?.classList.contains("authored-target-highlight"),
      ).toBe(true),
    );
    await user.click(view().getByText("[note 7]"));
    await waitFor(() => expect(document.getElementById("7")).toBeTruthy());
    await user.click(view().getByText("[note 4]"));
    await waitFor(() => expect(document.getElementById("4")).toBeTruthy());
    await user.click(
      within(notes).getByRole("button", {
        name: "Citation: [1] (resolved)",
      }),
    );
    await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });
    await user.click(view().getByText("[note 1]"));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ component: "article" }),
    );
    const reopenedNotes = await waitFor(() =>
      view().getByRole("complementary", { name: "Reading tools" }),
    );
    await user.click(within(reopenedNotes).getByText("1."));
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(scrolledTo).toBe("note-1");
    expect(router.state.location.search).toEqual({ component: "article" });
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("presents a publisher-note deep link inside Reading tools", async () => {
  resetActions();

  const router = await renderReading("?component=notes");

  await waitFor(() => view().getByText("A synthetic Source state passage."));
  const tools = view().getByRole("complementary", { name: "Reading tools" });
  expect(within(tools).getByText("Publisher-authored note.")).toBeTruthy();
  expect(document.querySelectorAll("article")).toHaveLength(2);
  expect(
    tools
      .querySelector("[data-reading-scroll-owner]")
      ?.getAttribute("data-reading-scroll-owner"),
  ).toBe("publisher-note");
  expect(router.state.location.search).toEqual({ component: "notes" });
});
