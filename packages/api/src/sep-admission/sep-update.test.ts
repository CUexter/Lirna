import { expect, test } from "bun:test";

import { createHarness } from "./fixtures/operations-harness";

test("creates a temporary unchanged comparison without admitting a state", async () => {
  const harness = createHarness({ existingUpdate: "unchanged" });

  const preview = await harness.operations.checkUpdate(
    "10000000-0000-4000-8000-000000000000",
  );

  expect(preview?.update).toEqual({
    sourceId: "10000000-0000-4000-8000-000000000000",
    observations: [
      {
        key: "submitted",
        result: "unchanged",
        comparedStateId: "30000000-0000-4000-8000-000000000000",
      },
    ],
  });
  expect(harness.getRecord()?.replacesSourceId).toBe(
    "10000000-0000-4000-8000-000000000000",
  );
  expect(harness.getCaptureCount()).toBe(1);
});

test("marks changed bytes for explicit Admission selection", async () => {
  const harness = createHarness({ existingUpdate: "changed" });

  const preview = await harness.operations.checkUpdate(
    "10000000-0000-4000-8000-000000000000",
  );

  expect(preview?.update?.observations).toEqual([
    { key: "submitted", result: "changed" },
  ]);
  expect(preview?.observations.map(({ key }) => key)).toEqual(["submitted"]);
});
