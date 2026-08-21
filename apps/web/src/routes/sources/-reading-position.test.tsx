import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";

const calls = {
  resumeGet: [] as unknown[],
  resumeSave: [] as unknown[],
};
let getResume: (input: unknown) => Promise<unknown> = async () => null;

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
  calls.resumeGet.length = 0;
  calls.resumeSave.length = 0;
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

    await user.click(view().getByText("Other components"));
    await user.click(view().getByRole("button", { name: "Supplement one" }));
    await waitFor(() => view().getByText("First supplement content."));
    window.scrollY = 480;
    await user.click(
      within(
        view().getByRole("navigation", { name: "Component path" }),
      ).getByRole("button", { name: "Article" }),
    );
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    expect(locations).toContainEqual({ top: 240 });
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
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          sourceId,
          stateId,
          componentIdentity: "supplement-one",
        }),
      ),
    );
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

    await user.click(view().getByText("Other components"));
    await user.click(view().getByRole("button", { name: "Supplement one" }));
    await waitFor(() => view().getByText("First supplement content."));
    await waitFor(() => expect(locations).toContainEqual({ top: 0 }));
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
