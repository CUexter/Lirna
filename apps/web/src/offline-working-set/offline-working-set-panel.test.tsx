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
  ["ready", "Ready for offline reading"],
  ["partial", "Partially ready for offline reading"],
  ["stale", "Stale, last usable replica retained"],
  [
    "pending-removal",
    "Removal requested; replica remains usable until confirmed",
  ],
] as const)("explains the %s replica lifecycle", (availability, label) => {
  render(<OfflineWorkingSetStatus inspection={inspection(availability)} />);
  expect(view().getByText(label)).toBeTruthy();
  expect(view().getByText(/100 bytes stored replica/)).toBeTruthy();
  expect(
    view().getByText(/250 bytes declared for 2 referenced Source resources/),
  ).toBeTruthy();
  expect(
    view().getByText(/Source-resource bodies are not retained/),
  ).toBeTruthy();
});

test("drives retain progress and completion through the public panel", async () => {
  let complete: (() => void) | undefined;
  const retained = inspection("ready");
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
  await waitFor(() => view().getByText("Ready for offline reading"));
});

test("reports persistence failures from lifecycle controls", async () => {
  const retained = inspection("ready");
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

test("ignores an obsolete replica read after Source-state navigation", async () => {
  let finishOldRead: (() => void) | undefined;
  const workingSets = moduleFixture({
    inspect: ({ sourceId }) => {
      if (sourceId === "new-source")
        return Promise.resolve(inspection("ready"));
      return new Promise((resolve) => {
        finishOldRead = () => resolve(inspection("stale"));
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
  await waitFor(() => view().getByText("Ready for offline reading"));
  act(() => finishOldRead?.());
  expect(view().queryByText("Stale, last usable replica retained")).toBeNull();
});

function inspection(
  availability: Extract<
    OfflineWorkingSetInspection,
    { status: "available" }
  >["availability"],
): OfflineWorkingSetInspection {
  return {
    status: "available",
    availability,
    retainedAt: "2026-08-25T12:00:00.000Z",
    synchronizedAt: "2026-08-25T12:00:00.000Z",
    replicaBytes: 100,
    referencedResourceBytes: 250,
    referencedResourceCount: 2,
    reasons: availability === "partial" ? ["Supplement unavailable"] : [],
  };
}

function moduleFixture(
  overrides: Partial<OfflineWorkingSets>,
): OfflineWorkingSets {
  return {
    inspect: async () => ({ status: "absent" }),
    open: async () => ({ status: "absent" }),
    retain: async () => inspection("ready"),
    requestRemoval: async () => inspection("pending-removal"),
    restore: async () => inspection("ready"),
    confirmRemoval: async () => ({ status: "absent" }),
    ...overrides,
  };
}
