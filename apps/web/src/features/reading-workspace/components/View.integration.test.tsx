import { expect, test } from "bun:test";
import { waitFor, within } from "@testing-library/react";
import { sourceId, stateId } from "../test-support/fixtures";
import {
  calls,
  renderReading,
  resetActions,
  view,
} from "../test-support/routeHarness";

test("renders Source-state scholarly apparatus", async () => {
  resetActions();
  await renderReading();
  await waitFor(() =>
    expect(view().getByRole("heading", { level: 1 }).textContent).toBe(
      "Synthetic Reading Source",
    ),
  );

  expect(
    view().getAllByText("Ada Lovelace, Grace Hopper").length,
  ).toBeGreaterThan(0);
  expect(view().getAllByText("Synthetic Publisher").length).toBeGreaterThan(0);
  expect(view().queryByText("Reading degraded")).toBeNull();
  expect(view().queryByText("Capture and rendering status")).toBeNull();
  expect(view().queryByText("Synthetic capture warning.")).toBeNull();
  expect(view().getAllByRole("banner")[0]?.classList.contains("sticky")).toBe(
    true,
  );
  expect(
    view().getByRole("link", { name: "Source library" }).getAttribute("href"),
  ).toBe("/sources");
  expect(within(view().getByRole("main")).queryByText("SEP")).toBeNull();
  expect(view().getAllByText("Synthetic figure")).toHaveLength(1);
  expect(
    view().queryByText("Rendering note: missing-semantic-asset"),
  ).toBeNull();
  const figure = document.getElementById("synthetic-figure");
  const followingParagraph = view().getByText("After the synthetic figure.");
  expect(figure?.compareDocumentPosition(followingParagraph) ?? 0).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  await waitFor(() =>
    expect(
      view().getByText("Reading position synchronized for Article"),
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
});
