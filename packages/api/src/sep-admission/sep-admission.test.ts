import { describe, expect, test } from "bun:test";

import { createHarness } from "./fixtures/operations-harness";
import { observeOperation } from "./sep-admission-observation";
import { SepAdmissionError } from "./sep-capture";

function observationRecords() {
  const records: Array<{ level: string; record: Record<string, unknown> }> = [];
  return {
    observation: {
      requestId: "req-test",
      emit(level: "info" | "warn" | "error", record: Record<string, unknown>) {
        records.push({ level, record });
      },
    },
    records,
  };
}

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
    expect(admitted?.states[0]?.observationKey).toBe("submitted");
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

  test("observes submission stages and one safe degraded summary", async () => {
    const harness = createHarness({ degradedCapture: true });
    const observed = observationRecords();

    await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
      observed.observation,
    );

    expect(observed.records.map(({ record }) => record.event)).toEqual([
      "sep_admission.started",
      "sep_admission.stage_changed",
      "sep_admission.stage_changed",
      "sep_admission.stage_changed",
      "sep_admission.stage_changed",
      "sep_admission.capture_degraded",
      "sep_admission.stage_changed",
      "sep_admission.completed",
    ]);
    expect(
      observed.records.find(
        ({ record }) => record.event === "sep_admission.capture_degraded",
      ),
    ).toMatchObject({
      level: "warn",
      record: {
        completeness: "partial",
        readingReadiness: "degraded",
        unresolvedResourceCount: 1,
        reasonCodes: ["component_unavailable"],
      },
    });
    expect(JSON.stringify(observed.records)).not.toContain("private-value");
    expect(JSON.stringify(observed.records)).not.toContain("private failure");
  });

  test("observes admission persistence and Reading parsing separately", async () => {
    const harness = createHarness();
    const preview = await harness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );
    const observed = observationRecords();

    await harness.operations.admit(
      preview.id,
      ["submitted"],
      observed.observation,
    );

    expect(
      observed.records
        .filter(({ record }) => record.event === "sep_admission.stage_changed")
        .map(({ record }) => record.stage),
    ).toEqual([
      "validation",
      "database_persistence",
      "reading_derivative_parsing",
      "database_persistence",
    ]);
  });

  test("observes an unavailable admission as failed", async () => {
    const harness = createHarness();
    const observed = observationRecords();

    expect(
      await harness.operations.admit(
        "missing",
        ["submitted"],
        observed.observation,
      ),
    ).toBeUndefined();

    expect(observed.records.at(-1)).toMatchObject({
      level: "error",
      record: {
        event: "sep_admission.failed",
        outcome: "failure",
        errorName: "SepAdmissionUnavailable",
      },
    });
  });

  test("omits stacks for expected failures and includes them for unexpected failures", async () => {
    const expectedHarness = createHarness();
    const expected = observationRecords();
    await expect(
      expectedHarness.operations.admit("missing", [], expected.observation),
    ).rejects.toThrow("Select at least one observation");
    expect(expected.records.at(-1)?.record).not.toHaveProperty("errorStack");

    const unexpectedHarness = createHarness({ failExpandedCapture: true });
    const preview = await unexpectedHarness.operations.submit(
      "https://plato.stanford.edu/entries/logic/",
    );
    const unexpected = observationRecords();
    await expect(
      unexpectedHarness.operations.retry(preview.id, unexpected.observation),
    ).rejects.toThrow("controlled expanded capture failure");
    expect(unexpected.records.at(-1)?.record).toMatchObject({
      event: "sep_admission.failed",
      stage: "mandatory_download",
      errorName: "Error",
    });
    expect(unexpected.records.at(-1)?.record.errorStack).toBeString();
  });

  test("redacts URLs from unexpected failure details", async () => {
    const observed = observationRecords();

    await expect(
      observeOperation("submit", observed.observation, async () => {
        throw new Error("failed for https://example.com/private?token=secret");
      }),
    ).rejects.toThrow();

    const serialized = JSON.stringify(observed.records);
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("token=secret");
    expect(observed.records.at(-1)?.record).toMatchObject({
      errorMessage: "Unexpected SEP Admission failure",
    });
  });

  test("omits nested network details from expected failure messages", async () => {
    const observed = observationRecords();

    await expect(
      observeOperation("submit", observed.observation, async () => {
        throw new SepAdmissionError(
          "SEP main capture failed: https://example.com/private?token=secret",
        );
      }),
    ).rejects.toThrow();

    expect(observed.records.at(-1)?.record).toMatchObject({
      errorMessage: "SEP main capture failed",
    });
    expect(JSON.stringify(observed.records)).not.toContain("token=secret");
  });
});
