import { describe, expect, test } from "bun:test";

import {
  readingFixture,
  sourceId,
  stateFixture,
  stateId,
} from "../orpc/routers/sep-admission.test-fixtures";
import { createOfflineWorkingSetSnapshot } from "./offline-working-set";

describe("Offline working set snapshot", () => {
  test("bounds the active Derivative and required Source resources with integrity metadata", () => {
    const snapshot = createOfflineWorkingSetSnapshot({
      workspace: workspace(),
      annotations: [],
      positions: [],
      synchronizedAt: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(snapshot.manifest).toMatchObject({
      sourceId,
      stateId,
      serverRetention: { state: "ready", reasons: [] },
      clientAvailability: { state: "unknown" },
      resources: [
        {
          identity: "active:/",
          byteLength: 100,
          sha256: "a".repeat(64),
        },
      ],
    });
    expect(snapshot.manifest.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.manifest.activeDerivative.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("reports partial server retention without discarding the usable Derivative", () => {
    const input = workspace();
    input.state.resources = [];
    const snapshot = createOfflineWorkingSetSnapshot({
      workspace: input,
      annotations: [],
      positions: [],
    });

    expect(snapshot.manifest.serverRetention).toEqual({
      state: "partial",
      reasons: ["Required Source resource is missing: active:/"],
    });
    expect(snapshot.replica.workspace.reading.mainComponent.identity).toBe(
      "active:/",
    );
  });

  test("refuses a snapshot without explicit activation history", () => {
    const input = workspace();
    input.state.derivatives = [];
    expect(() =>
      createOfflineWorkingSetSnapshot({
        workspace: input,
        annotations: [],
        positions: [],
      }),
    ).toThrow("active Reading Derivative");
  });

  test("enforces captured resource count and byte bounds", () => {
    const oversized = workspace();
    if (!oversized.state.capture.limits)
      throw new Error("Fixture requires capture limits");
    oversized.state.capture.limits.maxResourceBytes = 50;
    expect(() =>
      createOfflineWorkingSetSnapshot({
        workspace: oversized,
        annotations: [],
        positions: [],
      }),
    ).toThrow("oversized Source resource");

    const excessiveTotal = workspace();
    if (!excessiveTotal.state.capture.limits)
      throw new Error("Fixture requires capture limits");
    excessiveTotal.state.capture.limits.maxTotalBytes = 100;
    expect(() =>
      createOfflineWorkingSetSnapshot({
        workspace: excessiveTotal,
        annotations: [],
        positions: [],
      }),
    ).toThrow("replica exceeds its captured byte bound");

    const excessiveCount = workspace();
    if (!excessiveCount.state.capture.limits)
      throw new Error("Fixture requires capture limits");
    excessiveCount.state.capture.limits.maxComponents = 0;
    excessiveCount.state.capture.limits.maxAssets = 0;
    expect(() =>
      createOfflineWorkingSetSnapshot({
        workspace: excessiveCount,
        annotations: [],
        positions: [],
      }),
    ).not.toThrow();
    excessiveCount.state.resources.push({
      ...excessiveCount.state.resources[0],
      identity: "active:/extra",
    });
    excessiveCount.reading.provenance.inputResourceHashes.push({
      identity: "active:/extra",
      sha256: "a".repeat(64),
    });
    expect(() =>
      createOfflineWorkingSetSnapshot({
        workspace: excessiveCount,
        annotations: [],
        positions: [],
      }),
    ).toThrow("captured resource bound");
  });
});

function workspace() {
  const reading = readingFixture();
  const activation = {
    id: "50000000-0000-4000-8000-000000000000",
    derivativeId: "40000000-0000-4000-8000-000000000000",
    sequence: 1,
    actorId: "system:admission",
    reason: "Initial validated derivative",
    activatedAt: "2026-08-25T00:00:00.000Z",
    consequences: {
      semantic: { changedComponents: [] },
      structure: [],
      diagnostics: { added: [], removed: [] },
      relocations: [],
    },
  };
  const state = stateFixture({
    resources: [
      {
        identity: "active:/",
        role: "main",
        requestedUrl: reading.mainComponent.requestedUrl,
        finalUrl: reading.mainComponent.finalUrl,
        status: 200,
        mediaType: "text/html",
        selectedHeaders: {},
        requestCount: 1,
        downloadedBytes: 100,
        retrievedAt: reading.mainComponent.retrievedAt,
        byteLength: 100,
        sha256: "a".repeat(64),
        discoveryEdge: "submitted-entry",
        depth: 0,
      },
    ],
    derivatives: [
      {
        id: activation.derivativeId,
        kind: "sep-reading-v1",
        valid: true,
        generation: {
          version: 1,
          parser: { id: "parse5", version: "7.3.0" },
          renderer: { id: "lirna-reading-react", version: "1" },
          inputResourceHashes: reading.provenance.inputResourceHashes,
        },
        validation: { status: "valid", checks: [] },
        createdAt: activation.activatedAt,
        currentActivation: activation,
        activationHistory: [activation],
        provenance: reading.provenance,
      },
    ],
  });
  if (state.capture.limits) state.capture.limits.maxTotalBytes = 1024 * 1024;
  return {
    reading,
    state,
    source: {
      id: sourceId,
      title: state.title,
      admittedAt: state.admittedAt,
      authors: [],
      publisher: state.publisher,
      publicationHistory: [],
      kind: "sep" as const,
      currentStateId: stateId,
      states: [],
    },
    citationResolutions: [],
  };
}
