import { expect, test } from "bun:test";
import { act, cleanup, waitFor } from "@testing-library/react";
import {
  calls,
  readingRouteState,
  renderReading,
  resetActions,
  view,
} from "@/components/reading-workspace/reading-route-test-harness";
import {
  readingFixture,
  sourceId,
  stateId,
} from "@/components/reading-workspace/reading-test-fixtures";
import { readingWorkspaceFixture } from "@/components/reading-workspace/source-information-test-fixture";

test("shows Reading loading and unavailable route states", async () => {
  resetActions();
  let resolveReading: (value: ReturnType<typeof readingFixture>) => void = () =>
    undefined;
  readingRouteState.getReading = (input) => {
    calls.reading.push(input);
    return new Promise<ReturnType<typeof readingFixture>>((resolve) => {
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
  readingRouteState.getReading = async (input) => {
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

test("falls back to a retained Reading workspace", async () => {
  resetActions();
  const retainedWorkspace = readingWorkspaceFixture();
  readingRouteState.retainedReplica = {
    status: "available",
    revision: "retained-reading-lifecycle",
    retainedAt: "2026-08-25T12:00:00.000Z",
    workspace: retainedWorkspace,
    annotations: [],
    positions: [],
  };
  readingRouteState.getReading = async () => {
    throw new Error("Backend unavailable");
  };

  await renderReading();
  await waitFor(() =>
    expect(view().getByRole("status").textContent).toContain(
      "Backend unavailable",
    ),
  );
  expect(
    view().getByRole("heading", { name: "Synthetic Reading Source" }),
  ).toBeTruthy();
});
