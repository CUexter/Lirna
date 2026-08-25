// biome-ignore lint/style/noExcessiveLinesPerFile: Route-level bibliography state and manual linking share one mocked workspace harness.
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

import type { InquiryOutputs } from "@/clients/inquiry";
import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";
import {
  readingWorkspaceFixture,
  sepUpdateClientStub,
} from "./-source-information-test-fixture";

const citationResolutionCalls: unknown[] = [];
let citationResolutions: InquiryOutputs["sources"]["readingWorkspace"]["citationResolutions"] =
  [];
let citationEvidence: unknown[] = [];
let citationResolutionError: Error | undefined;

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
          queryFn: async () =>
            readingWorkspaceFixture(readingFixture(), citationResolutions),
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
    sources: {
      readingWorkspace: {
        key: ({ input }: { input: unknown }) => ["reading-workspace", input],
      },
    },
    citationResolutions: {
      evidence: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-evidence", input],
          queryFn: async () => citationEvidence,
        }),
      },
      list: {
        key: ({ input }: { input: unknown }) => ["citation-resolutions", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-resolutions", input],
          queryFn: async () => citationResolutions,
        }),
      },
      create: {
        mutationOptions: () => ({
          mutationFn: async (input: unknown) => {
            citationResolutionCalls.push(input);
            if (citationResolutionError) throw citationResolutionError;
            const resolution: (typeof citationResolutions)[number] = {
              ...(input as object),
              id: "50000000-0000-4000-8000-000000000000",
              sourceId,
              sourceStateId: stateId,
              derivativeId: "60000000-0000-4000-8000-000000000000",
              componentIdentity: "article",
              mentionId: "citation-one",
              bibliographyComponentIdentity: "article",
              bibliographyEntryId: "entry-one",
              publisherAnchor: null,
              offsetBasis: "normalized-derivative-text-v1",
              normalizedStartOffset: 0,
              normalizedEndOffset: 3,
              exactText: "[1]",
              prefix: "",
              suffix: "",
              actorId: "user-1",
              method: "manual",
              confidence: null,
              reasoning: null,
              createdAt: "2026-08-24T12:00:00.000Z",
              updatedAt: "2026-08-24T12:00:00.000Z",
            };
            citationResolutions = [resolution];
            return resolution;
          },
        }),
      },
      clear: {
        mutationOptions: () => ({ mutationFn: async () => true }),
      },
      infer: {
        mutationOptions: () => ({
          mutationFn: async () => ({
            status: "unavailable",
            candidateId: null,
            confidence: null,
            reasoning: "Provider unavailable",
          }),
        }),
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

function view() {
  return within(document.body);
}

afterEach(() => {
  citationResolutionCalls.length = 0;
  citationResolutions = [];
  citationEvidence = [];
  citationResolutionError = undefined;
  localStorage.clear();
  cleanup();
});

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

test("manually resolves only a server-supplied Citation candidate", async () => {
  citationEvidence = [mentionEvidence()];
  const user = userEvent.setup();
  await renderReading("?component=article");
  await user.click(
    await view().findByRole("button", { name: "Citation: [1] (resolved)" }),
  );
  await user.click(
    await view().findByRole("button", {
      name: "Select this candidate manually",
    }),
  );

  await waitFor(() => expect(citationResolutionCalls).toHaveLength(1));
  expect(citationResolutionCalls[0]).toEqual({
    sourceId,
    stateId,
    componentIdentity: "article",
    mentionId: "citation-one",
    bibliographyComponentIdentity: "article",
    bibliographyEntryId: "entry-one",
    method: "manual",
  });
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

function mentionEvidence() {
  return {
    id: "60000000-0000-4000-8000-000000000000:article:citation-one",
    sourceId,
    sourceStateId: stateId,
    derivativeId: "60000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    mentionId: "citation-one",
    label: "[1]",
    context: "Synthetic publication content [1]",
    state: "ambiguous",
    deterministicReason: "The authored label has bounded candidates.",
    candidates: [
      {
        id: "article:entry-one",
        bibliographyComponentIdentity: "article",
        bibliographyEntryId: "entry-one",
        label: "[1]",
        text: "Ada Lovelace. Synthetic publisher entry.",
        reason: "The authored label matched this candidate.",
      },
    ],
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
      inferenceEligible: true,
    },
  };
}
