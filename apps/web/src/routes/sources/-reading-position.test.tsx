// biome-ignore lint/style/noExcessiveLinesPerFile: Reading-position journeys share one route mock and lifecycle.
import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { act, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { historySemanticLocation } from "@/components/reading-workspace/reading-history-position";
import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";
import {
  readingWorkspaceFixture,
  sepUpdateClientStub,
} from "./-source-information-test-fixture";

const calls = {
  resumeGet: [] as unknown[],
  resumeSave: [] as unknown[],
};
let getResume: (input: unknown) => Promise<unknown> = async () => null;
let getReading = async () => readingFixture();

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: sepUpdateClientStub,
    sources: {
      assistant: {
        ask: {
          mutationOptions: () => ({
            mutationFn: async () => ({ answer: "Synthetic answer." }),
          }),
        },
      },
      readingWorkspace: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading-workspace", input],
          queryFn: async () => readingWorkspaceFixture(await getReading()),
        }),
      },
      resume: {
        get: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["resume", input],
            queryFn: () => getResume(input),
          }),
        },
        save: {
          mutationOptions: () => ({
            mutationFn: async (input: unknown) => {
              calls.resumeSave.push(input);
            },
          }),
        },
      },
    },
  },
}));

await mock.module("@/clients/library", () => ({
  library: {
    sources: {
      readingWorkspace: {
        key: ({ input }: { input: unknown }) => ["reading-workspace", input],
      },
    },
    citationResolutions: {
      evidence: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-evidence", input],
          queryFn: async () => [],
        }),
      },
      list: {
        key: ({ input }: { input: unknown }) => ["citation-resolutions", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-resolutions", input],
          queryFn: async () => [],
        }),
      },
      create: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      clear: {
        mutationOptions: () => ({ mutationFn: async () => false }),
      },
      infer: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
    },
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

afterEach(cleanup);

function view() {
  return within(document.body);
}

function resetActions() {
  window.history.replaceState({}, "");
  calls.resumeGet.length = 0;
  calls.resumeSave.length = 0;
  getReading = async () => readingFixture();
  getResume = async (input) => {
    calls.resumeGet.push(input);
    return null;
  };
}

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

test("restores a component location through its parent breadcrumb", async () => {
  resetActions();
  const originalScrollTo = window.scrollTo;
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const locations: ScrollToOptions[] = [];
  window.scrollTo = (options) => {
    if (typeof options === "object") locations.push(options);
  };
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 240,
    writable: true,
  });

  try {
    const user = userEvent.setup();
    await renderReading();
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    locations.length = 0;

    await user.click(view().getByRole("tab", { name: "Supplementary" }));
    await user.click(view().getByRole("button", { name: "Supplement one" }));
    await waitFor(() => view().getByText("First supplement content."));
    window.scrollY = 480;
    await user.click(
      within(
        view().getByRole("navigation", { name: "Component path" }),
      ).getByRole("button", { name: "Article" }),
    );
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    await waitFor(() => expect(locations).toContainEqual({ top: 240 }));
  } finally {
    window.scrollTo = originalScrollTo;
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

test("restores and saves positions for the selected Source component", async () => {
  resetActions();
  const originalScrollTo = window.scrollTo;
  const locations: ScrollToOptions[] = [];
  window.scrollTo = (options) => {
    if (typeof options === "object") locations.push(options);
  };
  getResume = async (input) => {
    calls.resumeGet.push(input);
    return {
      sourceId,
      stateId,
      sourceTitle: "Synthetic Reading Source",
      componentIdentity: "supplement-one",
      componentLabel: "Supplement one",
      scrollTop: 640,
      savedAt: "2026-08-20T01:00:00.000Z",
    };
  };

  try {
    await renderReading("?component=supplement-one");
    await waitFor(() => view().getByText("First supplement content."));
    await waitFor(() => expect(locations).toContainEqual({ top: 640 }));
    expect(calls.resumeGet).toContainEqual({
      sourceId,
      stateId,
      componentIdentity: "supplement-one",
    });
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          sourceId,
          stateId,
          componentIdentity: "supplement-one",
          semanticLocation: expect.objectContaining({
            source: { sourceId, stateId },
            scene: expect.objectContaining({
              identity: "supplement-one",
              owner: "article",
            }),
            fallback: expect.objectContaining({ scrollTop: 0 }),
          }),
        }),
      ),
    );
  } finally {
    window.scrollTo = originalScrollTo;
  }
});

test("does not restore a saved position over an explicit fragment", async () => {
  resetActions();
  const originalScrollTo = window.scrollTo;
  const locations: ScrollToOptions[] = [];
  window.scrollTo = (options) => {
    if (typeof options === "object") locations.push(options);
  };
  getResume = async () => ({
    sourceId,
    stateId,
    sourceTitle: "Synthetic Reading Source",
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 640,
    savedAt: "2026-08-20T01:00:00.000Z",
  });

  try {
    await renderReading("#Poss");
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(locations).toEqual([]);
  } finally {
    window.scrollTo = originalScrollTo;
  }
});

test("starts an unseen Source component at the top before saving it", async () => {
  resetActions();
  const originalScrollTo = window.scrollTo;
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const locations: ScrollToOptions[] = [];
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
    writable: true,
  });
  window.scrollTo = (options) => {
    if (typeof options !== "object") return;
    locations.push(options);
    window.scrollY = options.top ?? window.scrollY;
  };

  try {
    const user = userEvent.setup();
    await renderReading();
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    window.scrollY = 350;
    locations.length = 0;
    calls.resumeSave.length = 0;

    await user.click(view().getByRole("tab", { name: "Supplementary" }));
    await user.click(view().getByRole("button", { name: "Supplement one" }));
    await waitFor(() => view().getByText("First supplement content."));
    await waitFor(() => expect(locations).toContainEqual({ top: 0 }));
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "supplement-one",
          scrollTop: 0,
        }),
      ),
    );
  } finally {
    window.scrollTo = originalScrollTo;
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

test("persists publisher-note semantics with its tools-container pixels", async () => {
  resetActions();
  const user = userEvent.setup();
  await renderReading();
  await waitFor(() => view().getByText("[note 1]"));

  await user.click(view().getByText("[note 1]"));
  await waitFor(() => view().getByText("Publisher-authored note."));
  const container = document.querySelector<HTMLElement>(
    '[data-reading-scroll-owner="publisher-note"]',
  );
  if (!container) throw new Error("Publisher-note scroll owner is unavailable");
  container.scrollTop = 360;
  act(() => container.dispatchEvent(new Event("scroll")));

  await waitFor(
    () =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 360,
          semanticLocation: expect.objectContaining({
            source: { sourceId, stateId },
            scene: {
              identity: "notes",
              componentIdentity: "notes",
              owner: "publisher-note",
            },
            fallback: expect.objectContaining({
              scrollTop: 360,
              textExcerpt: expect.stringContaining("publisher-authored note"),
            }),
          }),
        }),
      ),
    { timeout: 2_000 },
  );
});

test("restores publisher-note progress after explicit note navigation yields", async () => {
  resetActions();
  getResume = async (input) => {
    calls.resumeGet.push(input);
    if ((input as { componentIdentity?: string }).componentIdentity !== "notes")
      return null;
    return {
      sourceId,
      stateId,
      sourceTitle: "Synthetic Reading Source",
      componentIdentity: "notes",
      componentLabel: "Notes",
      scrollTop: 720,
      semanticLocation: {
        version: 1,
        source: { sourceId, stateId },
        scene: {
          identity: "notes",
          componentIdentity: "notes",
          owner: "publisher-note",
        },
        block: {
          identity: "scene:9bdbf349f9e2b1e9",
          strategy: "scene-fallback",
        },
        progress: 0,
        fallback: {
          scrollTop: 720,
          blockIndex: 0,
          blockTag: "scene",
          textExcerpt: "",
          authoredAnchor: null,
        },
      },
      savedAt: "2026-08-20T01:00:00.000Z",
    };
  };

  const user = userEvent.setup();
  await renderReading();
  await user.click(await view().findByText("[note 1]"));
  await view().findByText("Publisher-authored note.");
  const container = document.querySelector<HTMLElement>(
    '[data-reading-scroll-owner="publisher-note"]',
  );
  if (!container) throw new Error("Publisher-note scroll owner is unavailable");

  expect(container.scrollTop).toBe(0);
  await user.click(view().getByRole("tab", { name: "Contents" }));
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await waitFor(() => expect(container.scrollTop).toBe(720));
  expect(calls.resumeGet).toContainEqual({
    sourceId,
    stateId,
    componentIdentity: "notes",
  });
});

test("does not overwrite pending publisher-note progress before reader movement", async () => {
  resetActions();
  getResume = async (input) => {
    calls.resumeGet.push(input);
    if ((input as { componentIdentity?: string }).componentIdentity === "notes")
      return new Promise(() => undefined);
    return null;
  };

  const user = userEvent.setup();
  await renderReading();
  await user.click(await view().findByText("[note 1]"));
  await view().findByText("Publisher-authored note.");
  act(() => window.dispatchEvent(new Event("pagehide")));
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 20);
      }),
  );

  expect(
    calls.resumeSave.some(
      (input) =>
        (input as { componentIdentity?: string }).componentIdentity === "notes",
    ),
  ).toBe(false);
});

test("keeps independent progress while switching publisher-note scenes", async () => {
  resetActions();
  getReading = async () => readingWithTwoPublisherNotes();
  const user = userEvent.setup();
  await renderReading();
  await user.click(await view().findByText("[note 1]"));
  await view().findByText("Publisher-authored note.");
  const container = document.querySelector<HTMLElement>(
    '[data-reading-scroll-owner="publisher-note"]',
  );
  if (!container) throw new Error("Publisher-note scroll owner is unavailable");

  container.scrollTop = 310;
  act(() => container.dispatchEvent(new Event("scroll")));
  await user.click(view().getByRole("tab", { name: "Contents" }));
  container.scrollTop = 150;
  act(() => container.dispatchEvent(new Event("scroll")));
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await waitFor(() => expect(container.scrollTop).toBe(310));

  await user.click(view().getByRole("link", { name: "Second publisher note" }));
  await view().findByText("Second publisher-note scene.");
  await waitFor(() => expect(container.scrollTop).toBe(0));

  container.scrollTop = 620;
  act(() => container.dispatchEvent(new Event("scroll")));
  await user.click(view().getByRole("link", { name: "First publisher note" }));
  await view().findByText("Publisher-authored note.");
  await waitFor(() => expect(container.scrollTop).toBe(310));

  await user.click(view().getByRole("link", { name: "Second publisher note" }));
  await view().findByText("Second publisher-note scene.");
  await waitFor(() => expect(container.scrollTop).toBe(620));
});

test("preserves article and publisher-note progress through a reference round trip", async () => {
  resetActions();
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 540,
    writable: true,
  });

  try {
    const user = userEvent.setup();
    await renderReading();
    await user.click(await view().findByText("[note 1]"));
    await view().findByText("Publisher-authored note.");
    const container = document.querySelector<HTMLElement>(
      '[data-reading-scroll-owner="publisher-note"]',
    );
    if (!container)
      throw new Error("Publisher-note scroll owner is unavailable");
    container.scrollTop = 360;
    act(() => container.dispatchEvent(new Event("scroll")));

    await user.click(view().getByRole("button", { name: "Reference (1)" }));
    await view().findByText("Reference context");
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 360,
          semanticLocation: expect.objectContaining({
            scene: expect.objectContaining({ owner: "publisher-note" }),
          }),
        }),
      ),
    );
    expect(window.scrollY).toBe(540);

    await user.click(view().getByRole("button", { name: "Show in article" }));
    await view().findByText("Publisher-authored note.");
    expect(historySemanticLocation(sourceId, stateId, "notes")).toMatchObject({
      scene: { identity: "notes", owner: "publisher-note" },
      fallback: { scrollTop: 360 },
    });
    expect(window.scrollY).toBe(540);
  } finally {
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

test("restores article progress after a publisher-note round trip", async () => {
  resetActions();
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const originalScrollTo = window.scrollTo;
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 540,
    writable: true,
  });
  window.scrollTo = (options) => {
    if (typeof options === "object")
      window.scrollY = options.top ?? window.scrollY;
  };

  try {
    const user = userEvent.setup();
    await renderReading();
    await view().findByText("A synthetic Source state passage.");
    window.scrollY = 540;
    act(() => window.dispatchEvent(new Event("scroll")));
    await user.click(view().getByText("[note 1]"));
    await view().findByText("Publisher-authored note.");

    await user.click(
      view().getByRole("link", { name: "Back to proposition 1" }),
    );
    await view().findByText("A synthetic Source state passage.");
    await waitFor(() => expect(window.scrollY).toBe(540));
  } finally {
    window.scrollTo = originalScrollTo;
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

test("preserves article and publisher-note progress through a Bibliography round trip", async () => {
  resetActions();
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 540,
    writable: true,
  });

  try {
    const user = userEvent.setup();
    await renderReading();
    await user.click(await view().findByText("[note 1]"));
    await view().findByText("Publisher-authored note.");
    const container = document.querySelector<HTMLElement>(
      '[data-reading-scroll-owner="publisher-note"]',
    );
    if (!container)
      throw new Error("Publisher-note scroll owner is unavailable");
    container.scrollTop = 480;
    act(() => container.dispatchEvent(new Event("scroll")));
    const publisherNote = container.querySelector<HTMLElement>(
      '[data-reading-scene-owner="publisher-note"]',
    );
    if (!publisherNote) throw new Error("Publisher-note scene is unavailable");
    await user.click(
      within(publisherNote).getByRole("button", { name: /Citation: \[1\]/ }),
    );
    await view().findByRole("region", { name: "Bibliography" });
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 480,
        }),
      ),
    );
    expect(window.scrollY).toBe(540);

    const citationContext = view()
      .getAllByText("Citation context")
      .find((summary) =>
        summary.parentElement?.textContent?.includes("Publisher-authored note"),
      );
    if (!citationContext?.parentElement)
      throw new Error("Publisher-note citation context is unavailable");
    await user.click(citationContext);
    await user.click(
      within(citationContext.parentElement).getByRole("button", {
        name: "Show in article",
      }),
    );
    await view().findByText("Publisher-authored note.");
    await waitFor(() => expect(container.scrollTop).toBe(480));
    expect(historySemanticLocation(sourceId, stateId, "notes")).toMatchObject({
      scene: { identity: "notes", owner: "publisher-note" },
      fallback: { scrollTop: 480 },
    });
    expect(window.scrollY).toBe(540);
  } finally {
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

test("preserves the article position when opening Bibliography", async () => {
  resetActions();
  const originalScrollTo = window.scrollTo;
  const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const locations: ScrollToOptions[] = [];
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
    writable: true,
  });
  window.scrollTo = (options) => {
    if (typeof options !== "object") return;
    locations.push(options);
    window.scrollY = options.top ?? window.scrollY;
  };

  try {
    const user = userEvent.setup();
    await renderReading();
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    window.scrollY = 620;
    locations.length = 0;

    await user.click(view().getByRole("tab", { name: "Bibliography" }));
    await view().findByRole("region", { name: "Bibliography" });
    expect(locations).toEqual([]);
    expect(window.scrollY).toBe(620);
  } finally {
    window.scrollTo = originalScrollTo;
    if (scrollY) Object.defineProperty(window, "scrollY", scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  }
});

function readingWithTwoPublisherNotes() {
  const reading = readingFixture();
  const notes = reading.components.find(
    (component) => component.role === "notes",
  );
  if (!notes) throw new Error("Publisher-note fixture is unavailable");
  const secondUrl =
    "https://plato.stanford.edu/entries/synthetic/notes-two.html";
  const firstWithLink = {
    ...notes,
    introductoryBlocks: [
      ...notes.introductoryBlocks,
      {
        kind: "paragraph" as const,
        children: [
          {
            kind: "link" as const,
            href: "notes-two.html",
            internal: false,
            children: [
              { kind: "text" as const, text: "Second publisher note" },
            ],
          },
        ],
      },
    ],
  };
  const second = {
    ...notes,
    identity: "notes-two",
    label: "Notes two",
    order: notes.order + 1,
    requestedUrl: secondUrl,
    finalUrl: secondUrl,
    introductoryBlocks: [
      {
        kind: "paragraph" as const,
        children: [
          { kind: "text" as const, text: "Second publisher-note scene. " },
          {
            kind: "link" as const,
            href: "notes.html",
            internal: false,
            children: [{ kind: "text" as const, text: "First publisher note" }],
          },
        ],
      },
    ],
    plainText: "Second publisher-note scene. First publisher note",
  };
  return {
    ...reading,
    components: reading.components
      .map((component) =>
        component.identity === notes.identity ? firstWithLink : component,
      )
      .concat(second),
  };
}
