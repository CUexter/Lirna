import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, waitFor, within } from "@testing-library/react";

import { renderRoute } from "./-route-test-harness";

const sourceId = "20000000-0000-4000-8000-000000000000";
const stateId = "30000000-0000-4000-8000-000000000000";
let getSources: () => Promise<unknown> = async () => [];

await mock.module("@/clients/library", () => ({
  library: {
    sepAdmission: {
      listSources: {
        queryOptions: () => ({
          queryKey: ["sources"],
          queryFn: getSources,
        }),
      },
    },
  },
}));

const { Route } = await import("./index");

afterEach(() => {
  cleanup();
  getSources = async () => [];
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
  return renderRoute(rootRoute.addChildren([libraryRoute]), "/sources/");
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
  const readingLink = view().getByRole("link", {
    name: "Open reading workspace",
  });
  expect(readingLink.getAttribute("href")).toBe(
    `/sources/${sourceId}/${stateId}`,
  );
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
