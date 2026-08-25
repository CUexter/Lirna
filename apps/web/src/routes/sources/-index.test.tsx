import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { act, cleanup, waitFor, within } from "@testing-library/react";

import { renderRoute } from "./-route-test-harness";

const sourceId = "20000000-0000-4000-8000-000000000000";
const stateId = "30000000-0000-4000-8000-000000000000";
let getSources: () => Promise<unknown> = async () => [];
let deleteSource: (input: unknown) => Promise<unknown> = async () => true;
let deletedInput: unknown;

await mock.module("@/clients/library", () => ({
  library: {
    sources: {
      list: {
        queryOptions: () => ({
          queryKey: ["sources"],
          queryFn: getSources,
        }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: deleteSource }),
      },
    },
  },
}));

const { Route } = await import("./index");

afterEach(() => {
  cleanup();
  getSources = async () => [];
  deleteSource = async () => true;
  deletedInput = undefined;
});

function view() {
  return within(document.body);
}

async function renderLibrary() {
  const rootRoute = createRootRoute();
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/",
    component: Route.options.component,
  });
  const readingRoute = createRoute({
    getParentRoute: () => libraryRoute,
    path: "$sourceId/$stateId",
    component: () => null,
  });
  return renderRoute(
    rootRoute.addChildren([libraryRoute.addChildren([readingRoute])]),
    "/sources/",
  );
}

test("renders an empty Source library and admission links", async () => {
  await renderLibrary();

  await waitFor(() => view().getByText("No Sources yet"));
  expect(view().getByRole("link", { name: "Add Source" })).toBeTruthy();
  expect(
    view().getByRole("link", { name: "Add your first Source" }),
  ).toBeTruthy();
});

test("renders admitted Sources and links to the latest Source state", async () => {
  getSources = async () => [
    {
      id: sourceId,
      title: "Synthetic SEP entry",
      admittedAt: "2026-08-18T12:01:00.000Z",
      authors: ["Synthetic Author"],
      publisher: "Synthetic Press",
      publicationHistory: ["First published 2024"],
      states: [
        {
          id: stateId,
          sequence: 1,
          observationKey: "submitted",
          canonicalUrl: "https://plato.stanford.edu/entries/test/",
          admittedAt: "2026-08-18T12:01:00.000Z",
        },
      ],
    },
  ];

  await renderLibrary();

  await waitFor(() => view().getByText("Synthetic SEP entry"));
  expect(
    view().queryByRole("link", { name: "Open reading workspace" }),
  ).toBeNull();
  expect(view().queryByText("No Sources yet")).toBeNull();
});

test("shows the Source library failure", async () => {
  getSources = async () => {
    throw new Error("Synthetic library unavailable");
  };

  await renderLibrary();

  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Synthetic library unavailable",
    ),
  );
  expect(view().getByText("Source library unavailable")).toBeTruthy();
});

test("offers a related replacement without changing a legacy Source", async () => {
  getSources = async () => [
    {
      id: sourceId,
      title: "Legacy SEP text",
      admittedAt: "2026-08-18T12:01:00.000Z",
      authors: [],
      publisher: "",
      publicationHistory: [],
      kind: "legacy-sep-text",
      currentStateId: stateId,
      states: [
        {
          id: stateId,
          sequence: 0,
          observationKey: "submitted",
          canonicalUrl: "",
          title: "Legacy SEP text",
          publisher: "",
          admittedAt: "2026-08-18T12:01:00.000Z",
        },
      ],
    },
  ];

  await renderLibrary();
  await waitFor(() =>
    expect(view().getAllByText("Legacy SEP text").length).toBeGreaterThan(0),
  );
  const replacement = view().getByRole("link", {
    name: "Offer related replacement",
  });
  expect(replacement.getAttribute("href")).toContain(sourceId);
  expect(view().getAllByText("Legacy SEP text").length).toBeGreaterThan(0);

  const card = view().getByRole("link", {
    name: "Open Legacy SEP text in reading workspace",
  });
  expect(card.getAttribute("tabindex")).toBe("0");
});

test("deletes a Source after confirmation", async () => {
  getSources = async () => [
    {
      id: sourceId,
      title: "Synthetic SEP entry",
      admittedAt: "2026-08-18T12:01:00.000Z",
      authors: ["Synthetic Author"],
      publisher: "Synthetic Press",
      publicationHistory: ["First published 2024"],
      states: [{ id: stateId, sequence: 1, observationKey: "submitted" }],
    },
  ];
  deleteSource = async (input) => {
    deletedInput = input;
    getSources = async () => [];
    return true;
  };
  await renderLibrary();
  await waitFor(() => view().getByText("Synthetic SEP entry"));

  await act(async () => {
    view().getByRole("button", { name: "Delete Synthetic SEP entry" }).click();
  });
  expect(deletedInput).toBeUndefined();
  expect(view().getByText(/Are you sure\?/)).toBeTruthy();
  expect(
    view().getByRole("status", { name: "Confirmation expires in 5 seconds" }),
  ).toBeTruthy();

  await act(async () => {
    view().getByRole("button", { name: "Cancel" }).click();
  });
  expect(
    view().getByRole("button", { name: "Delete Synthetic SEP entry" }),
  ).toBeTruthy();

  await act(async () => {
    view().getByRole("button", { name: "Delete Synthetic SEP entry" }).click();
  });
  await act(async () => {
    view()
      .getByRole("button", { name: "Confirm delete Synthetic SEP entry" })
      .click();
  });
  await waitFor(() => expect(deletedInput).toEqual({ sourceId }));
  await waitFor(() =>
    expect(view().queryByText("Synthetic SEP entry")).toBeNull(),
  );
});
