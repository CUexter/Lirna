import { expect, test } from "bun:test";
import { act, cleanup, waitFor, within } from "@testing-library/react";
import { previewFixture } from "./-admission-test-fixtures";
import {
  calls,
  readingRouteState,
  renderReading,
  resetActions,
  view,
} from "./-reading-route-test-harness";
import {
  openSupplementOne,
  setupReadingUser,
} from "./-reading-route-test-scenarios";
import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import {
  readingWorkspaceFixture,
  setSepUpdateResult,
} from "./-source-information-test-fixture";

test("shows Reading loading and unavailable states through its route", async () => {
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

test("opens a retained Reading workspace when the backend is unavailable", async () => {
  resetActions();
  const retainedWorkspace = readingWorkspaceFixture();
  readingRouteState.retainedReplica = {
    availability: "ready",
    manifest: {
      resources: [],
      totalBytes: 100,
      synchronizedAt: "2026-08-25T12:00:00.000Z",
      serverRetention: { state: "ready", reasons: [] },
      activeDerivative: {
        activationId:
          retainedWorkspace.state?.derivatives[0]?.currentActivation?.id,
      },
    },
    replica: {
      workspace: retainedWorkspace,
      annotations: [],
      positions: [],
    },
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

test("renders source-state scholarly apparatus and navigates components", async () => {
  resetActions();
  const user = setupReadingUser();
  const router = await renderReading();
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
  expect(view().getByText("Synthetic figure")).toBeTruthy();
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

  await openSupplementOne(user);
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
  await openSupplementOne(user);
  expect(router.state.location.search).toEqual({ component: "supplement-one" });
});

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
