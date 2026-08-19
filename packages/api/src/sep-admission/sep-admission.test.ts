import { describe, expect, test } from "bun:test";

import { createHarness } from "./fixtures/operations-harness";

describe("SEP Admission lifecycle", () => {
  test("persists a seven-day preview and derives metrics from retained resources", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    expect(preview.expiresAt).toBe("2026-08-24T12:00:00.000Z");
    expect(preview.policy).toEqual({
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    });
    expect(preview.metrics).toEqual({
      requests: 2,
      downloadedBytes: 12,
      retainedBytes: 12,
      processingMilliseconds: 12,
    });
    expect(harness.getRecord()?.resources).toHaveLength(2);
    expect(preview.capture).toMatchObject({
      budget: "standard",
      completeness: "complete",
      readingReadiness: "ready",
      retryAvailable: true,
    });
  });

  test("replaces an active capture once with the expanded budget", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    const retried = await harness.operations.retry(preview.id);

    expect(retried?.capture).toMatchObject({
      budget: "expanded",
      retryUsed: true,
      retryAvailable: false,
    });
    await expect(harness.operations.retry(preview.id)).rejects.toThrow(
      "already been used",
    );
  });

  test("consumes a failed expanded attempt without replacing evidence", async () => {
    const harness = createHarness({ failExpandedCapture: true });
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    await expect(harness.operations.retry(preview.id)).rejects.toThrow(
      "controlled expanded capture failure",
    );

    expect((await harness.operations.get(preview.id))?.capture).toMatchObject({
      budget: "standard",
      retryUsed: true,
      retryAvailable: false,
    });
    await expect(harness.operations.retry(preview.id)).rejects.toThrow(
      "already been used",
    );
  });

  test("extends an active preview to seven days from operation time", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );
    harness.setTime("2026-08-20T12:00:00.000Z");

    const extended = await harness.operations.extend(preview.id);

    expect(extended?.expiresAt).toBe("2026-08-27T12:00:00.000Z");
  });

  test("does not read or resurrect an expired preview", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );
    harness.setTime("2026-08-24T12:00:00.000Z");

    expect(await harness.operations.get(preview.id)).toBeUndefined();
    expect(await harness.operations.extend(preview.id)).toBeUndefined();
    expect(harness.getRecord()).toBeUndefined();
  });

  test("deletes the preview lifecycle record", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    expect(await harness.operations.delete(preview.id)).toBe(true);
    expect(await harness.operations.get(preview.id)).toBeUndefined();
  });

  test("admits exact persisted hashes without a post-review capture", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );
    const previewHashes = preview.resources.map(({ sha256 }) => sha256);

    const admitted = await harness.operations.admit(preview.id, ["submitted"]);

    expect(harness.getCaptureCount()).toBe(1);
    expect(admitted?.states[0]?.resources.map(({ sha256 }) => sha256)).toEqual(
      previewHashes,
    );
    expect(
      await harness.operations.getState(
        admitted?.sourceId ?? "",
        admitted?.states[0]?.id ?? "",
      ),
    ).toEqual(admitted?.states[0]);
  });

  test("requires an explicit unique observation selection", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    await expect(harness.operations.admit(preview.id, [])).rejects.toThrow(
      "Select at least one observation",
    );
    await expect(
      harness.operations.admit(preview.id, ["submitted", "submitted"]),
    ).rejects.toThrow("selected only once");
  });

  test("compares byte-equivalent observations without conflating provenance", async () => {
    const harness = createHarness({ archive: true });

    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    expect(preview.comparison).toMatchObject({ result: "equivalent" });
    expect(preview.observations.map(({ key }) => key)).toEqual([
      "submitted",
      "recommended-archive",
    ]);
    expect(preview.observations[0]?.resources[0]?.observationKey).toBe(
      "submitted",
    );
    expect(preview.observations[1]?.resources[0]?.observationKey).toBe(
      "recommended-archive",
    );
  });

  test("reports materially distinct observation bytes", async () => {
    const harness = createHarness({ archive: true, distinctArchive: true });

    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );

    expect(preview.comparison).toMatchObject({ result: "distinct" });
  });
});
