import { expect, test } from "bun:test";

import { readingWorkspaceFixture } from "@/features/reading-workspace/test-support/sourceInformation";
import { createMemoryOfflineWorkingSetLifecycle } from "../lifecycle";
import type { OfflineSnapshot } from "../store";
import { createMemoryOfflineWorkingSets } from "../test-support/memory";
import type { OfflineWorkingSetTarget } from "../workingSets";

const sourceId = "10000000-0000-4000-8000-000000000000";
const firstTarget = {
  sourceId,
  stateId: "20000000-0000-4000-8000-000000000000",
};
const secondTarget = {
  sourceId,
  stateId: "20000000-0000-4000-8000-000000000001",
};
const unrelatedTarget = {
  sourceId: "10000000-0000-4000-8000-000000000001",
  stateId: "20000000-0000-4000-8000-000000000002",
};

test("inventories multiple retained Source states and removes one Source deliberately", async () => {
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: snapshotFor,
    fetchCurrentness: currentnessFor,
  });
  await workingSets.retain(firstTarget);
  await workingSets.retain(secondTarget);
  await workingSets.retain(unrelatedTarget);

  const inventory = await workingSets.inventory();
  expect(inventory).toHaveLength(3);
  expect(inventory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: firstTarget,
        status: "available",
        inspection: expect.objectContaining({
          localAvailability: "readable",
          freshness: "current",
          removal: "retained",
          readiness: "ready",
        }),
      }),
      expect.objectContaining({ target: secondTarget, status: "available" }),
      expect.objectContaining({ target: unrelatedTarget, status: "available" }),
    ]),
  );

  await expect(workingSets.removeSource(sourceId)).resolves.toBe(2);
  await expect(workingSets.inventory()).resolves.toEqual([
    expect.objectContaining({ target: unrelatedTarget, status: "available" }),
  ]);
});

test("isolates corrupt and unsupported records and recovers them explicitly", async () => {
  const records = new Map<string, unknown>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: snapshotFor,
    fetchCurrentness: currentnessFor,
    records,
  });
  await workingSets.retain(unrelatedTarget);
  records.set(key(firstTarget), { broken: true });
  records.set(key(secondTarget), { schemaVersion: 2 });
  records.set("bad-source:bad-state", { schemaVersion: "future" });

  const inventory = await workingSets.inventory();
  expect(inventory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ target: unrelatedTarget, status: "available" }),
      expect.objectContaining({ target: firstTarget, status: "corrupt" }),
      expect.objectContaining({ target: secondTarget, status: "unsupported" }),
      expect.objectContaining({
        target: { sourceId: "bad-source", stateId: "bad-state" },
        status: "corrupt",
      }),
    ]),
  );

  await workingSets.discardInventoryEntry(key(firstTarget));
  expect(records.has(key(firstTarget))).toBeFalse();
  expect(records.has(key(secondTarget))).toBeTrue();
  await expect(workingSets.open(unrelatedTarget)).resolves.toMatchObject({
    status: "available",
  });
});

test("migrates the legacy schema and rejects a future schema without deleting it", async () => {
  const records = new Map<string, unknown>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: snapshotFor,
    fetchCurrentness: currentnessFor,
    records,
  });
  await workingSets.retain(firstTarget);
  const legacy = structuredClone(records.get(key(firstTarget))) as Record<
    string,
    unknown
  >;
  delete legacy.schemaVersion;
  records.set(key(firstTarget), legacy);
  records.set(key(secondTarget), { schemaVersion: 7 });

  await expect(workingSets.inspect(firstTarget)).resolves.toMatchObject({
    status: "available",
  });
  expect(records.get(key(firstTarget))).toMatchObject({ schemaVersion: 1 });
  await expect(workingSets.inspect(secondTarget)).resolves.toEqual({
    status: "unsupported",
    localAvailability: "retained",
    schemaVersion: 7,
    message:
      "Offline working-set schema version 7 is unsupported. Retained data was preserved.",
  });
  expect(records.has(key(secondTarget))).toBeTrue();
});

test("expires only records older than the supplied lifecycle cutoff", async () => {
  let now = new Date("2026-08-01T00:00:00.000Z");
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: snapshotFor,
    fetchCurrentness: currentnessFor,
    now: () => now,
  });
  await workingSets.retain(firstTarget);
  now = new Date("2026-08-20T00:00:00.000Z");
  await workingSets.retain(unrelatedTarget);

  await expect(
    workingSets.expireRetainedBefore(new Date("2026-08-10T00:00:00.000Z")),
  ).resolves.toBe(1);
  await expect(workingSets.open(firstTarget)).resolves.toEqual({
    status: "absent",
  });
  await expect(workingSets.open(unrelatedTarget)).resolves.toMatchObject({
    status: "available",
  });
});

test("notifies another tab about retain, freshness, and removal lifecycle changes", async () => {
  const records = new Map<string, unknown>();
  const lifecycle = createMemoryOfflineWorkingSetLifecycle();
  let activationId = "50000000-0000-4000-8000-000000000000";
  const input = {
    fetchSnapshot: snapshotFor,
    fetchCurrentness: async (target: OfflineWorkingSetTarget) => ({
      activationId,
      currentStateId: target.stateId,
    }),
    records,
    lifecycle,
  };
  const firstTab = createMemoryOfflineWorkingSets(input).workingSets;
  const secondTab = createMemoryOfflineWorkingSets(input).workingSets;
  let notifications = 0;
  let inventoryNotifications = 0;
  const unsubscribe = secondTab.subscribe(firstTarget, () => {
    notifications += 1;
  });
  const unsubscribeInventory = secondTab.subscribeInventory(() => {
    inventoryNotifications += 1;
  });

  await firstTab.retain(firstTarget);
  expect(notifications).toBe(1);
  expect(inventoryNotifications).toBe(1);
  await firstTab.inspect(firstTarget);
  activationId = "new-activation";
  await firstTab.inspect(firstTarget);
  expect(notifications).toBe(2);
  expect(inventoryNotifications).toBe(2);
  await firstTab.requestRemoval(firstTarget);
  expect(notifications).toBe(3);
  expect(inventoryNotifications).toBe(3);
  await expect(secondTab.inspect(firstTarget)).resolves.toMatchObject({
    freshness: "outdated",
    removal: "pending",
  });
  unsubscribe();
  unsubscribeInventory();
});

test("marks Source deletion durably and blocks an in-flight retain from recreating it", async () => {
  const records = new Map<string, unknown>();
  let releaseSnapshot: (() => void) | undefined;
  const snapshotStarted = Promise.withResolvers<void>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    records,
    fetchCurrentness: currentnessFor,
    fetchSnapshot: async (target) => {
      snapshotStarted.resolve();
      await new Promise<void>((resolve) => {
        releaseSnapshot = resolve;
      });
      return snapshotFor(target);
    },
  });
  const retaining = workingSets.retain(firstTarget);
  await snapshotStarted.promise;

  await workingSets.reconcileSourceDeletion(sourceId, async () => true);
  expect(records.has(`source-deletion:${sourceId}`)).toBeTrue();
  releaseSnapshot?.();

  await expect(retaining).rejects.toThrow(
    "retention is blocked while Source deletion is pending",
  );
  await expect(workingSets.inventory()).resolves.toEqual([]);
});

test("preserves the deletion marker and retained states when authoritative deletion fails", async () => {
  const records = new Map<string, unknown>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    records,
    fetchCurrentness: currentnessFor,
    fetchSnapshot: snapshotFor,
  });
  await workingSets.retain(firstTarget);

  await expect(
    workingSets.reconcileSourceDeletion(sourceId, async () => {
      throw new Error("Authoritative deletion unavailable");
    }),
  ).rejects.toThrow("Authoritative deletion unavailable");

  expect(records.has(`source-deletion:${sourceId}`)).toBeTrue();
  await expect(workingSets.open(firstTarget)).resolves.toMatchObject({
    status: "available",
  });
  await expect(workingSets.retain(secondTarget)).rejects.toThrow(
    "retention is blocked while Source deletion is pending",
  );
});

test("recovers confirmed and authoritatively absent Source deletions on inventory", async () => {
  const records = new Map<string, unknown>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    records,
    fetchCurrentness: currentnessFor,
    fetchSnapshot: snapshotFor,
    sourceExists: async () => false,
  });
  await workingSets.retain(firstTarget);
  await workingSets.retain(unrelatedTarget);
  records.set(`source-deletion:${sourceId}`, {
    kind: "source-deletion",
    sourceId,
    status: "requested",
    requestedAt: "2026-08-29T12:00:00.000Z",
  });

  await expect(workingSets.inventory()).resolves.toEqual([
    expect.objectContaining({ target: unrelatedTarget, status: "available" }),
  ]);
  expect(records.has(key(firstTarget))).toBeFalse();
  expect(records.get(`source-deletion:${sourceId}`)).toMatchObject({
    status: "confirmed",
  });
});

test("blocks removal-state writes while Source deletion is pending", async () => {
  const records = new Map<string, unknown>();
  const { workingSets } = createMemoryOfflineWorkingSets({
    records,
    fetchCurrentness: currentnessFor,
    fetchSnapshot: snapshotFor,
  });
  await workingSets.retain(firstTarget);
  records.set(`source-deletion:${sourceId}`, {
    kind: "source-deletion",
    sourceId,
    status: "requested",
    requestedAt: "2026-08-29T12:00:00.000Z",
  });

  await expect(workingSets.requestRemoval(firstTarget)).resolves.toEqual({
    status: "absent",
  });
  records.delete(`source-deletion:${sourceId}`);
  await workingSets.requestRemoval(firstTarget);
  records.set(`source-deletion:${sourceId}`, {
    kind: "source-deletion",
    sourceId,
    status: "requested",
    requestedAt: "2026-08-29T12:00:00.000Z",
  });
  await expect(workingSets.restore(firstTarget)).resolves.toEqual({
    status: "absent",
  });
});

function key(target: OfflineWorkingSetTarget) {
  return `${target.sourceId}:${target.stateId}`;
}

async function currentnessFor(target: OfflineWorkingSetTarget) {
  return {
    activationId: "50000000-0000-4000-8000-000000000000",
    currentStateId: target.stateId,
  };
}

async function snapshotFor(
  target: OfflineWorkingSetTarget,
): Promise<OfflineSnapshot> {
  const workspace = structuredClone(readingWorkspaceFixture());
  if (!workspace.state) throw new Error("Fixture requires a first-class state");
  workspace.source.id = target.sourceId;
  workspace.source.currentStateId = target.stateId;
  workspace.state.id = target.stateId;
  workspace.state.sourceId = target.sourceId;
  workspace.reading.source.id = target.sourceId;
  workspace.reading.source.stateId = target.stateId;
  const replica = { workspace, annotations: [], positions: [] };
  const resource = workspace.state.resources[0];
  const activation = workspace.state.derivatives[0]?.currentActivation;
  if (!(resource && activation))
    throw new Error("Fixture requires retention data");
  return {
    manifest: {
      version: 1,
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
      serverRetention: { state: "ready", reasons: [] },
      clientAvailability: {
        state: "unknown",
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
