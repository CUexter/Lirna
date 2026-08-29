import { afterEach, expect, test } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  OfflineWorkingSetInspection,
  OfflineWorkingSets,
} from "./offline-working-set";
import {
  OfflineWorkingSetPanel,
  OfflineWorkingSetStatus,
} from "./offline-working-set-panel";

afterEach(cleanup);

const view = () => within(document.body);

test("explains absent, transferring, and failed retention states", () => {
  const rendered = render(<OfflineWorkingSetStatus />);
  expect(view().getByText(/Not retained/)).toBeTruthy();
  rendered.rerender(
    <OfflineWorkingSetStatus progress={{ completed: 2, total: 4 }} />,
  );
  expect(view().getByText("Retained 2 of 4 items.")).toBeTruthy();
  expect(view().getByLabelText("Offline retention progress")).toBeTruthy();
  rendered.rerender(<OfflineWorkingSetStatus error="Storage quota exceeded" />);
  expect(view().getByRole("alert").textContent).toContain(
    "Storage quota exceeded",
  );
});

test.each([
  ["ready", "Ready for supported offline activities"],
  ["partial", "Partial capability for supported offline activities"],
] as const)("explains %s named-activity readiness", (readiness, label) => {
  render(<OfflineWorkingSetStatus inspection={inspection({ readiness })} />);
  expect(view().getByText(label)).toBeTruthy();
  expect(view().getByText(/100 bytes stored replica/)).toBeTruthy();
  expect(
    view().getByText(/250 bytes declared for 2 referenced Source resources/),
  ).toBeTruthy();
  expect(
    view().getByText(/Source-resource bodies are not retained/),
  ).toBeTruthy();
  expect(view().getByText(/Read retained typed content/)).toBeTruthy();
  expect(
    view().getByText(/Save reading progress offline: unsupported/),
  ).toBeTruthy();
});

test("reports local readability, freshness, and removal independently", () => {
  const rendered = render(
    <OfflineWorkingSetStatus
      inspection={inspection({ freshness: "outdated" })}
    />,
  );
  expect(view().getByText(/Locally available: readable/)).toBeTruthy();
  expect(view().getByText(/Freshness: outdated/)).toBeTruthy();
  expect(view().getByText(/Removal: not requested/)).toBeTruthy();

  rendered.rerender(
    <OfflineWorkingSetStatus
      inspection={inspection({ freshness: "unknown", removal: "pending" })}
    />,
  );
  expect(view().getByText(/Freshness: unknown/)).toBeTruthy();
  expect(view().getByText(/Removal: pending/)).toBeTruthy();
  expect(view().getByText(/Locally available: readable/)).toBeTruthy();
});

test("explains incompatible shell data without claiming readiness", () => {
  render(
    <OfflineWorkingSetStatus
      inspection={{
        status: "incompatible",
        localAvailability: "retained",
        persistedVersion: 2,
        shellCompatibility: {
          status: "incompatible",
          shellVersion: 1,
          persistedVersion: 2,
          reason:
            "Application shell version 1 cannot read persisted Offline working-set version 2.",
        },
        message:
          "Application shell version 1 cannot read persisted Offline working-set version 2. Retained data was preserved.",
      }}
    />,
  );
  expect(view().getByText("Offline reading unavailable")).toBeTruthy();
  expect(view().getByText(/Retained data was preserved/)).toBeTruthy();
  expect(
    view().queryByText("Ready for supported offline activities"),
  ).toBeNull();
});

test("drives retain progress and completion through the public panel", async () => {
  let complete: (() => void) | undefined;
  const retained = inspection();
  const workingSets = moduleFixture({
    retain: (_target, onProgress) => {
      if (!onProgress) throw new Error("Progress observer required");
      onProgress(1, 3);
      return new Promise((resolve) => {
        complete = () => {
          onProgress(3, 3);
          resolve(retained);
        };
      });
    },
  });
  render(
    <OfflineWorkingSetPanel
      sourceId="source-id"
      stateId="state-id"
      workingSets={workingSets}
    />,
  );
  await waitFor(() => view().getByRole("button", { name: /Retain for/ }));
  fireEvent.click(view().getByRole("button", { name: /Retain for/ }));
  await waitFor(() => view().getByText("Retained 1 of 3 items."));
  act(() => complete?.());
  await waitFor(() =>
    view().getByText("Ready for supported offline activities"),
  );
});

test("reports persistence failures from lifecycle controls", async () => {
  const retained = inspection();
  const workingSets = moduleFixture({
    inspect: async () => retained,
    requestRemoval: async () => {
      throw new Error("Storage quota exceeded");
    },
  });
  render(
    <OfflineWorkingSetPanel
      sourceId="source-id"
      stateId="state-id"
      workingSets={workingSets}
    />,
  );
  await waitFor(() => view().getByRole("button", { name: /Remove retained/ }));
  fireEvent.click(view().getByRole("button", { name: /Remove retained/ }));
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Storage quota exceeded",
    ),
  );
});

test("refreshes freshness when the module observes authoritative change", async () => {
  let freshness: "current" | "outdated" = "current";
  let notify: (() => void) | undefined;
  const workingSets = moduleFixture({
    inspect: async () => inspection({ freshness }),
    subscribe: (_target, onChange) => {
      notify = onChange;
      return () => undefined;
    },
  });
  render(
    <OfflineWorkingSetPanel
      sourceId="source-id"
      stateId="state-id"
      workingSets={workingSets}
    />,
  );
  await waitFor(() => view().getByText(/Freshness: current/));

  freshness = "outdated";
  act(() => notify?.());
  await waitFor(() => view().getByText(/Freshness: outdated/));
  expect(view().getByText(/Locally available: readable/)).toBeTruthy();
});

test("ignores an obsolete replica read after Source-state navigation", async () => {
  let finishOldRead: (() => void) | undefined;
  const workingSets = moduleFixture({
    inspect: ({ sourceId }) => {
      if (sourceId === "new-source") return Promise.resolve(inspection());
      return new Promise((resolve) => {
        finishOldRead = () => resolve(inspection({ freshness: "outdated" }));
      });
    },
  });
  const rendered = render(
    <OfflineWorkingSetPanel
      sourceId="old-source"
      stateId="old-state"
      workingSets={workingSets}
    />,
  );
  rendered.rerender(
    <OfflineWorkingSetPanel
      sourceId="new-source"
      stateId="new-state"
      workingSets={workingSets}
    />,
  );
  await waitFor(() =>
    view().getByText("Ready for supported offline activities"),
  );
  act(() => finishOldRead?.());
  expect(view().queryByText(/Freshness: outdated/)).toBeNull();
});

function inspection(
  overrides: Partial<
    Extract<OfflineWorkingSetInspection, { status: "available" }>
  > = {},
): OfflineWorkingSetInspection {
  const readiness = overrides.readiness ?? "ready";
  const retainedReadiness =
    overrides.retainedReadiness ??
    (readiness === "partial" ? "partial" : "ready");
  return {
    status: "available",
    localAvailability: "readable",
    freshness: "current",
    removal: "retained",
    readiness,
    retainedReadiness,
    shellCompatibility: {
      status: "compatible",
      shellVersion: 1,
      persistedVersion: 1,
    },
    activities: [
      {
        activity: "read-retained-content",
        label: "Read retained typed content",
        state: readiness === "partial" ? "limited" : "supported",
      },
      {
        activity: "save-reading-progress",
        label: "Save reading progress offline",
        state: "unsupported",
      },
    ],
    retainedAt: "2026-08-25T12:00:00.000Z",
    synchronizedAt: "2026-08-25T12:00:00.000Z",
    replicaBytes: 100,
    referencedResourceBytes: 250,
    referencedResourceCount: 2,
    ...overrides,
  };
}

function moduleFixture(
  overrides: Partial<OfflineWorkingSets>,
): OfflineWorkingSets {
  return {
    inventory: async () => [],
    subscribeInventory: () => () => undefined,
    inspect: async () => ({ status: "absent" }),
    subscribe: () => () => undefined,
    open: async () => ({ status: "absent" }),
    retain: async () => inspection(),
    requestRemoval: async () => inspection({ removal: "pending" }),
    restore: async () => inspection(),
    confirmRemoval: async () => ({ status: "absent" }),
    discardInventoryEntry: async () => undefined,
    removeSource: async () => 0,
    reconcileSourceDeletion: async (_sourceId, deleteSource) => deleteSource(),
    expireRetainedBefore: async () => 0,
    ...overrides,
  };
}
