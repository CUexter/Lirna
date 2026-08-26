import { expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { previewFixture } from "@/components/source-admission/admission-test-fixtures";
import {
  readingRouteState,
  renderReading,
  resetActions,
  view,
} from "./reading-route-test-harness";
import { setupReadingUser } from "./reading-route-test-scenarios";
import { sourceId, stateId } from "./reading-test-fixtures";
import {
  readingWorkspaceFixture,
  setSepUpdateResult,
} from "./source-information-test-fixture";

test("keeps legacy SEP text readable without first-class state evidence", async () => {
  resetActions();
  const workspace = readingWorkspaceFixture();
  readingRouteState.workspaceOverride = {
    ...workspace,
    state: undefined,
    source: {
      ...workspace.source,
      kind: "legacy-sep-text",
      stableKey: undefined,
    },
  };

  await renderReading();
  await waitFor(() =>
    expect(view().getByRole("heading", { level: 1 }).textContent).toBe(
      "Synthetic Reading Source",
    ),
  );
  expect(view().getByRole("heading", { name: "Legacy SEP text" })).toBeTruthy();
  expect(view().getByText(/preserved prototype remains readable/)).toBeTruthy();
  expect(
    view().getByRole("link", { name: "Offer related replacement" }),
  ).toBeTruthy();
});

test("inspects provenance, switches states, and previews an unchanged update", async () => {
  resetActions();
  setSepUpdateResult(
    previewFixture({
      update: {
        sourceId,
        observations: [
          {
            key: "submitted",
            result: "unchanged",
            comparedStateId: stateId,
          },
        ],
      },
    }),
  );
  const user = setupReadingUser();
  const router = await renderReading();
  await waitFor(() => view().getByText("State 1 evidence"));

  await user.click(view().getByText(/Resource and component manifest/));
  expect(view().getAllByText(/SHA-256/).length).toBeGreaterThan(0);
  expect(view().getByText(/submitted-entry/)).toBeTruthy();
  expect(view().getAllByText("Article").length).toBeGreaterThan(0);
  await user.click(view().getByText("Diagnostics and Derivatives"));
  expect(view().getByText(/sep-reading-v1.*current/)).toBeTruthy();
  expect(
    view().getByText(/One optional component was unavailable/),
  ).toBeTruthy();
  expect(
    view().getByText(/Unresolved supplement:.*Capture returned 404/),
  ).toBeTruthy();
  expect(view().getByText(/sep 1.*parse5 7.3.0.*1 inputs/)).toBeTruthy();

  await user.click(view().getByRole("button", { name: "Check for update" }));
  await waitFor(() => view().getByText("Active: unchanged"));
  expect(view().getByText("Admission decision")).toBeTruthy();

  await user.click(view().getByRole("link", { name: /State 2/ }));
  await waitFor(() =>
    expect(router.state.location.pathname).toContain(
      "30000000-0000-4000-8000-000000000000",
    ),
  );
});
