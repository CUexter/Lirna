import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";

const calls = { annotations: [] as unknown[], reading: [] as unknown[] };
let getReading: (input: unknown) => Promise<unknown> = async () =>
  readingFixture();

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      reading: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading", input],
          queryFn: () => getReading(input),
        }),
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
            return [];
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
  resolveReading(readingFixture());
  await waitFor(() => view().getByRole("heading", { level: 1 }));
  expect(calls.reading).toEqual([{ sourceId, stateId }]);

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
  expect(calls.annotations).toEqual([{ sourceId, stateId }]);

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

  await user.click(view().getByRole("button", { name: "Bibliography" }));
  await waitFor(() => view().getByRole("heading", { name: "Bibliography" }));
  expect(router.state.location.search).toEqual({
    component: "article",
    view: "bibliography",
  });
  await user.selectOptions(
    view().getByRole("combobox", { name: "Source component" }),
    "supplement-one",
  );
  await waitFor(() => view().getByText("First supplement content."));
  expect(router.state.location.search).toEqual({ component: "supplement-one" });
});

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
    await waitFor(() => view().getByRole("heading", { name: "Bibliography" }));
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });
    expect(
      view().getByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeTruthy();
    expect(document.getElementById("entry-one")?.className).toContain(
      "border-primary",
    );
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
    await user.click(view().getByRole("button", { name: "Back to citation" }));
    await waitFor(() =>
      expect(
        view().getByRole("button", { name: "Citation: [1] (resolved)" }),
      ).toBeTruthy(),
    );
    expect(router.state.location.search).toEqual({ component: "article" });
    expect(returnedTo).toBe("citation-one");
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("restores bibliography and Citation context from route search", async () => {
  resetActions();
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
