import { expect, test } from "bun:test";

import { readingWorkspaceFixture } from "@/components/reading-workspace/source-information-test-fixture";
import type { OfflineWorkingSetTarget } from "./offline-working-set";
import type { OfflineSnapshot } from "./offline-working-set-store";
import { createMemoryOfflineWorkingSets } from "./offline-working-set-test-support";

const target: OfflineWorkingSetTarget = {
  sourceId: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
};

test("owns retention, currentness, and recoverable removal behind one interface", async () => {
  const progress: Array<[number, number]> = [];
  let activationId = "40000000-0000-4000-8000-000000000000";
  let currentStateId = target.stateId;
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchCurrentness: async () => ({
      activationId,
      currentStateId,
    }),
    fetchSnapshot: fixture,
  });

  await expect(workingSets.inspect(target)).resolves.toEqual({
    status: "absent",
  });
  await expect(
    workingSets.retain(target, (completed, total) =>
      progress.push([completed, total]),
    ),
  ).resolves.toMatchObject({
    status: "available",
    localAvailability: "readable",
    freshness: "current",
    removal: "retained",
    readiness: "ready",
    replicaBytes: expect.any(Number),
    referencedResourceBytes: 1200,
    referencedResourceCount: 1,
  });
  expect(progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);

  activationId = "new-activation";
  await expect(workingSets.inspect(target)).resolves.toMatchObject({
    localAvailability: "readable",
    freshness: "outdated",
  });
  activationId = "40000000-0000-4000-8000-000000000000";
  currentStateId = "new-source-state";
  await expect(workingSets.inspect(target)).resolves.toMatchObject({
    localAvailability: "readable",
    freshness: "outdated",
  });
  await expect(workingSets.restore(target)).rejects.toThrow(
    "must have removal requested before it can be restored",
  );
  await expect(workingSets.confirmRemoval(target)).rejects.toThrow(
    "must have removal requested before it can be removed",
  );
  await expect(workingSets.requestRemoval(target)).resolves.toMatchObject({
    localAvailability: "readable",
    freshness: "outdated",
    removal: "pending",
  });
  await expect(workingSets.open(target)).resolves.toMatchObject({
    status: "available",
    workspace: { source: { id: target.sourceId } },
  });
  await expect(workingSets.restore(target)).resolves.toMatchObject({
    localAvailability: "readable",
    removal: "retained",
  });
  await expect(workingSets.restore(target)).rejects.toThrow(
    "must have removal requested before it can be restored",
  );
  await expect(workingSets.confirmRemoval(target)).rejects.toThrow(
    "must have removal requested before it can be removed",
  );
  await workingSets.requestRemoval(target);
  await expect(workingSets.confirmRemoval(target)).resolves.toEqual({
    status: "absent",
  });
  await expect(workingSets.open(target)).resolves.toEqual({ status: "absent" });
});

test("reports freshness as unknown when no authoritative comparison is possible", async () => {
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchCurrentness: async () => {
      throw new Error("Backend unavailable");
    },
    fetchSnapshot: fixture,
  });
  await workingSets.retain(target);

  await expect(workingSets.inspect(target)).resolves.toMatchObject({
    localAvailability: "readable",
    freshness: "unknown",
  });
  await expect(workingSets.open(target)).resolves.toMatchObject({
    status: "available",
  });
  await expect(workingSets.requestRemoval(target)).resolves.toMatchObject({
    freshness: "unknown",
    removal: "pending",
  });
});

test("names supported activities and limitations independently", async () => {
  const snapshot = await fixture();
  snapshot.manifest.serverRetention = {
    state: "partial",
    reasons: ["Supplement unavailable"],
  };
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });

  await expect(workingSets.retain(target)).resolves.toMatchObject({
    readiness: "partial",
    activities: [
      {
        activity: "read-retained-content",
        state: "limited",
        reason: "Supplement unavailable",
      },
      { activity: "view-retained-annotations", state: "supported" },
      {
        activity: "view-retained-citation-selections",
        state: "supported",
      },
      { activity: "restore-retained-position", state: "supported" },
      { activity: "save-reading-progress", state: "supported" },
      { activity: "change-authored-records", state: "unsupported" },
      { activity: "launch-without-network", state: "supported" },
    ],
  });
});

test("validates a replacement before preserving it and leaves the prior replica usable", async () => {
  let snapshot = await fixture();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });
  await workingSets.retain(target);
  const prior = await workingSets.open(target);

  snapshot = structuredClone(snapshot);
  snapshot.replica.workspace.reading.source.title = "Unverified replacement";
  await expect(workingSets.retain(target)).rejects.toThrow(
    "typed Reading replica failed local SHA-256 validation",
  );
  await expect(workingSets.open(target)).resolves.toEqual(prior);
});

test("rejects a foreign replacement before changing the retained target", async () => {
  let snapshot = await fixture();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });
  await workingSets.retain(target);
  const prior = await workingSets.open(target);

  snapshot = structuredClone(snapshot);
  snapshot.replica.workspace.state.sourceId = "foreign-source";
  snapshot.manifest.replicaSha256 = await hash(
    JSON.stringify(snapshot.replica),
  );
  await expect(workingSets.retain(target)).rejects.toThrow(
    "does not match the requested Source state",
  );
  await expect(workingSets.open(target)).resolves.toEqual(prior);
});

test("validates the typed replica without claiming local Source-resource bodies", async () => {
  const snapshot = await fixture();
  snapshot.manifest.resources[0].byteLength += 1;
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });

  await expect(workingSets.retain(target)).resolves.toMatchObject({
    status: "available",
    referencedResourceBytes: 1200,
  });
});

test("reports incompatible persisted records without deleting them", async () => {
  const records = new Map<string, unknown>([
    [`${target.sourceId}:${target.stateId}`, { manifest: { version: 2 } }],
  ]);
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    records,
  });

  await expect(workingSets.inspect(target)).resolves.toEqual({
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
  });
  await expect(workingSets.open(target)).rejects.toThrow(
    "Application shell version 1 cannot read persisted Offline working-set version 2. Retained data was preserved.",
  );
  expect(records.has(`${target.sourceId}:${target.stateId}`)).toBe(true);
});

test("withholds readiness when application-shell compatibility is missing", async () => {
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    inspectAppShell: async (persistedVersion) => ({
      status: "missing",
      persistedVersion,
      reason: "No active application-shell service worker was found.",
    }),
  });

  await expect(workingSets.retain(target)).resolves.toMatchObject({
    status: "available",
    localAvailability: "readable",
    readiness: "unavailable",
    retainedReadiness: "ready",
    shellCompatibility: { status: "missing", persistedVersion: 1 },
    activities: [
      { activity: "read-retained-content", state: "unsupported" },
      { activity: "view-retained-annotations", state: "unsupported" },
      {
        activity: "view-retained-citation-selections",
        state: "unsupported",
      },
      { activity: "restore-retained-position", state: "unsupported" },
      { activity: "save-reading-progress", state: "unsupported" },
      { activity: "change-authored-records", state: "unsupported" },
      { activity: "launch-without-network", state: "unsupported" },
    ],
  });
});

test("persists offline movement across module restart and retries idempotently", async () => {
  const records = new Map<string, unknown>();
  let available = false;
  let writes = 0;
  const savePosition = async (
    input: Parameters<
      ReturnType<
        typeof createMemoryOfflineWorkingSets
      >["workingSets"]["saveProgress"]
    >[0] & { savedAt?: string },
  ) => {
    writes += 1;
    if (!available) throw new Error("Backend unavailable");
    return {
      ...input,
      sourceTitle: "Synthetic Reading Source",
      savedAt: input.savedAt ?? "2026-08-26T12:00:00.000Z",
    };
  };
  const first = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    records,
    savePosition,
  });
  await first.workingSets.retain(target);

  await expect(
    first.workingSets.saveProgress({
      ...target,
      componentIdentity: "article",
      componentLabel: "Article",
      scrollTop: 640,
    }),
  ).resolves.toMatchObject({ status: "pending", position: { scrollTop: 640 } });
  await expect(first.workingSets.inspect(target)).resolves.toMatchObject({
    progressSynchronization: "failed",
  });

  const restarted = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    records,
    savePosition,
  });
  await expect(restarted.workingSets.open(target)).resolves.toMatchObject({
    positions: [{ scrollTop: 640 }],
  });
  available = true;
  await restarted.workingSets.retryProgress(target);
  await restarted.workingSets.retryProgress(target);
  await expect(restarted.workingSets.inspect(target)).resolves.toMatchObject({
    progressSynchronization: "synchronized",
  });
  expect(writes).toBe(2);
});

test("keeps the later server position when reconnect reveals a conflict", async () => {
  const serverPosition = {
    sourceId: target.sourceId,
    stateId: target.stateId,
    sourceTitle: "Synthetic Reading Source",
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 900,
    savedAt: "2026-08-27T12:00:00.000Z",
  };
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    savePosition: async () => serverPosition,
  });
  await workingSets.retain(target);

  await expect(
    workingSets.saveProgress({
      ...target,
      componentIdentity: "article",
      componentLabel: "Article",
      scrollTop: 640,
    }),
  ).resolves.toEqual({ status: "synchronized", position: serverPosition });
  await expect(workingSets.open(target)).resolves.toMatchObject({
    positions: [{ scrollTop: 900, savedAt: serverPosition.savedAt }],
  });
});

test("serializes overlapping progress saves without losing the newer write", async () => {
  const firstSaveReached = Promise.withResolvers<void>();
  const releaseFirstSave = Promise.withResolvers<void>();
  let saves = 0;
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    savePosition: async (position) => {
      saves += 1;
      if (saves === 1) {
        firstSaveReached.resolve();
        await releaseFirstSave.promise;
      }
      return {
        ...position,
        sourceTitle: "Synthetic Reading Source",
        savedAt: position.savedAt ?? "2026-08-26T12:00:00.000Z",
      };
    },
  });
  await workingSets.retain(target);

  const first = workingSets.saveProgress({
    ...target,
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 320,
  });
  await firstSaveReached.promise;
  const second = workingSets.saveProgress({
    ...target,
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 640,
  });
  releaseFirstSave.resolve();
  await Promise.all([first, second]);

  await expect(workingSets.open(target)).resolves.toMatchObject({
    positions: [{ scrollTop: 640 }],
  });
});

test("retention refresh preserves newer synchronized progress", async () => {
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    now: () => new Date("2026-08-27T12:00:00.000Z"),
  });
  await workingSets.retain(target);
  await workingSets.saveProgress({
    ...target,
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 640,
  });

  await workingSets.retain(target);

  await expect(workingSets.open(target)).resolves.toMatchObject({
    positions: [{ scrollTop: 640, savedAt: "2026-08-27T12:00:00.000Z" }],
  });
});

async function fixture(): Promise<OfflineSnapshot> {
  const workspace = readingWorkspaceFixture();
  if (!workspace.state) throw new Error("Fixture requires a first-class state");
  const replica = {
    workspace: { ...workspace, state: workspace.state },
    annotations: [],
    positions: [],
  };
  const resource = workspace.state.resources[0];
  const activation = workspace.state.derivatives[0]?.currentActivation;
  if (!(resource && activation))
    throw new Error("Fixture requires retention data");
  return {
    manifest: {
      version: 1 as const,
      sourceId: target.sourceId,
      stateId: target.stateId,
      synchronizedAt: "2026-08-25T12:00:00.000Z",
      activeDerivative: {
        id: activation.derivativeId,
        activationId: activation.id,
        sha256: "a".repeat(64),
        byteLength: 100,
      },
      resources: [
        {
          identity: resource.identity,
          role: resource.role,
          byteLength: resource.byteLength,
          sha256: resource.sha256,
        },
      ],
      replicaBytes: new TextEncoder().encode(JSON.stringify(replica))
        .byteLength,
      referencedResourceBytes: resource.byteLength,
      replicaSha256: await hash(JSON.stringify(replica)),
      serverRetention: { state: "ready" as const, reasons: [] },
      clientAvailability: {
        state: "unknown" as const,
        reason: "Client validation required",
      },
    },
    replica,
  };
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
