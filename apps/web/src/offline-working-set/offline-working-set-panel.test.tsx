import { afterEach, expect, test } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";

import {
  type OfflineWorkingSetOperations,
  OfflineWorkingSetPanel,
  OfflineWorkingSetStatus,
} from "./offline-working-set-panel";
import type { OfflineWorkingSetRecord } from "./offline-working-set-store";

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
  render(<OfflineWorkingSetStatus record={record(availability)} />);
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
  const retained = record("ready");
  const operations = operationFixture({
    retain: (_sourceId, _stateId, onProgress) => {
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
      operations={operations}
      sourceId={retained.manifest.sourceId}
      stateId={retained.manifest.stateId}
    />,
  );
  await waitFor(() => view().getByRole("button", { name: /Retain for/ }));
  fireEvent.click(view().getByRole("button", { name: /Retain for/ }));
  await waitFor(() => view().getByText("Retained 1 of 3 items."));
  act(() => complete?.());
  await waitFor(() => view().getByText("Ready for offline reading"));
});

test("reports persistence failures from lifecycle controls", async () => {
  const retained = record("ready");
  const operations = operationFixture({
    read: async () => retained,
    requestRemoval: async () => {
      throw new Error("Storage quota exceeded");
    },
  });
  render(
    <OfflineWorkingSetPanel
      operations={operations}
      sourceId={retained.manifest.sourceId}
      stateId={retained.manifest.stateId}
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
  const operations = operationFixture({
    read: (sourceId) => {
      if (sourceId === "new-source") return Promise.resolve(record("ready"));
      return new Promise((resolve) => {
        finishOldRead = () => resolve(record("stale"));
      });
    },
  });
  const rendered = render(
    <OfflineWorkingSetPanel
      operations={operations}
      sourceId="old-source"
      stateId="old-state"
    />,
  );
  rendered.rerender(
    <OfflineWorkingSetPanel
      operations={operations}
      sourceId="new-source"
      stateId="new-state"
    />,
  );
  await waitFor(() => view().getByText("Ready for offline reading"));
  act(() => finishOldRead?.());
  expect(view().queryByText("Stale, last usable replica retained")).toBeNull();
});

function record(
  availability: OfflineWorkingSetRecord["availability"],
): OfflineWorkingSetRecord {
  return {
    availability,
    retainedAt: "2026-08-25T12:00:00.000Z",
    manifest: {
      version: 1,
      sourceId: "10000000-0000-4000-8000-000000000000",
      stateId: "20000000-0000-4000-8000-000000000000",
      synchronizedAt: "2026-08-25T12:00:00.000Z",
      activeDerivative: {
        id: "30000000-0000-4000-8000-000000000000",
        activationId: "40000000-0000-4000-8000-000000000000",
        sha256: "a".repeat(64),
        byteLength: 100,
      },
      resources: [
        {
          identity: "active:/",
          role: "main",
          byteLength: 100,
          sha256: "c".repeat(64),
        },
        {
          identity: "active:/supplement",
          role: "component",
          byteLength: 150,
          sha256: "d".repeat(64),
        },
      ],
      replicaBytes: 100,
      referencedResourceBytes: 250,
      replicaSha256: "b".repeat(64),
      serverRetention: {
        state: availability === "partial" ? "partial" : "ready",
        reasons: availability === "partial" ? ["Supplement unavailable"] : [],
      },
      clientAvailability: {
        state: "unknown",
        reason: "Client validation required",
      },
    },
    replica: {} as OfflineWorkingSetRecord["replica"],
  };
}

function operationFixture(
  overrides: Partial<OfflineWorkingSetOperations>,
): OfflineWorkingSetOperations {
  return {
    read: async () => undefined,
    retain: async () => record("ready"),
    markStale: async (value) => ({ ...value, availability: "stale" }),
    requestRemoval: async (value) => ({
      ...value,
      availability: "pending-removal",
    }),
    restore: async (value) => ({ ...value, availability: "ready" }),
    confirmRemoval: async () => undefined,
    ...overrides,
  };
}
