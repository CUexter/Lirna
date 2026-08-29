import { offlineActivityReadiness } from "./activities";
import {
  type AppShellCompatibility,
  AppShellCompatibilityError,
} from "./appShellCompatibility";
import {
  lifecycleChangeMatches,
  type OfflineWorkingSetLifecycle,
} from "./lifecycle";
import {
  type OfflineSnapshot,
  type OfflineWorkingSetRecord,
  persistedManifestVersion,
  persistedRecord,
  persistedSchemaVersion,
  sourceDeletionKey,
  targetFromWorkingSetKey,
  UnsupportedOfflineWorkingSetSchemaError,
  validateSnapshot,
  validateTarget,
  workingSetKey,
} from "./persistence";
import {
  createOfflineReadingProgress,
  mergePendingProgress,
  progressSynchronization,
} from "./readingProgress";
import {
  createOfflineWorkingSetSourceDeletion,
  isSourceDeletionMarker,
} from "./sourceDeletion";
import type { OfflineWorkingSetStorage } from "./storage";
import type {
  OfflineWorkingSetInspection,
  OfflineWorkingSetInventoryEntry,
  OfflineWorkingSets,
  OfflineWorkingSetTarget,
  ReadingProgressInput,
  RetainedReadingWorkspace,
} from "./workingSets";

export type { OfflineSnapshot } from "./persistence";

interface OfflineWorkingSetDependencies {
  fetchSnapshot(target: OfflineWorkingSetTarget): Promise<OfflineSnapshot>;
  fetchCurrentness(target: OfflineWorkingSetTarget): Promise<{
    activationId?: string;
    currentStateId?: string;
  }>;
  now(): Date;
  runExclusive<T>(
    target: OfflineWorkingSetTarget,
    operation: () => Promise<T>,
  ): Promise<T>;
  savePosition(
    input: ReadingProgressInput & { savedAt?: string },
  ): Promise<
    Extract<
      RetainedReadingWorkspace,
      { status: "available" }
    >["positions"][number]
  >;
  inspectAppShell(persistedVersion: number): Promise<AppShellCompatibility>;
  storage: OfflineWorkingSetStorage;
  lifecycle: OfflineWorkingSetLifecycle;
  sourceExists(sourceId: string): Promise<boolean>;
  subscribeToCurrentness(
    target: OfflineWorkingSetTarget,
    onChange: () => void,
  ): () => void;
}

export function createOfflineWorkingSets({
  fetchSnapshot,
  fetchCurrentness,
  inspectAppShell,
  now,
  runExclusive,
  savePosition,
  storage,
  lifecycle,
  sourceExists,
  subscribeToCurrentness,
}: OfflineWorkingSetDependencies): OfflineWorkingSets {
  const observedFreshness = new Map<
    string,
    "current" | "outdated" | "unknown"
  >();
  const sourceDeletion = createOfflineWorkingSetSourceDeletion({
    lifecycle,
    now,
    sourceExists,
    storage,
  });

  async function persistRecord(key: string, record: OfflineWorkingSetRecord) {
    return storage.putUnless(
      key,
      record,
      sourceDeletionKey(record.manifest.sourceId),
    );
  }

  async function read(target: OfflineWorkingSetTarget) {
    const key = workingSetKey(target);
    const stored = await storage.get(key);
    if (stored === undefined) return undefined;
    const { record, migrated } = persistedRecord(stored);
    validateTarget(record, target);
    await validateSnapshot(record);
    if (migrated && !(await persistRecord(key, record))) return undefined;
    return record;
  }

  const progress = createOfflineReadingProgress({
    entries: () => storage.entries(),
    now,
    persist: persistRecord,
    publish: (target) => lifecycle.publish(target),
    read,
    runExclusive,
    savePosition,
  });

  async function inspect(target: OfflineWorkingSetTarget) {
    const stored = await storage.get(workingSetKey(target));
    if (stored === undefined) return absent();
    const schemaVersion = persistedSchemaVersion(stored);
    if (schemaVersion !== undefined && schemaVersion !== 1)
      return unsupportedInspection(schemaVersion);
    const version = persistedManifestVersion(stored);
    if (version === undefined)
      throw new Error(
        "Offline replica record is corrupt; retained data was preserved",
      );
    const shellCompatibility = await inspectAppShell(version);
    if (shellCompatibility.status === "incompatible") {
      return {
        status: "incompatible" as const,
        localAvailability: "retained" as const,
        persistedVersion: version,
        shellCompatibility,
        message: `${shellCompatibility.reason} Retained data was preserved.`,
      };
    }
    const { record, migrated } = persistedRecord(stored);
    validateTarget(record, target);
    await validateSnapshot(record);
    if (migrated && !(await persistRecord(workingSetKey(target), record)))
      return absent();
    const observed = await freshness(record, target);
    const key = workingSetKey(target);
    const priorFreshness = observedFreshness.get(key);
    observedFreshness.set(key, observed);
    if (priorFreshness !== undefined && priorFreshness !== observed)
      lifecycle.publish(target);
    return inspection(record, observed, shellCompatibility);
  }

  async function freshness(
    record: OfflineWorkingSetRecord,
    target: OfflineWorkingSetTarget,
  ): Promise<"current" | "outdated" | "unknown"> {
    try {
      const current = await fetchCurrentness(target);
      return current.currentStateId === target.stateId &&
        current.activationId === record.manifest.activeDerivative.activationId
        ? "current"
        : "outdated";
    } catch {
      return "unknown";
    }
  }

  return {
    async inventory() {
      await sourceDeletion.recover();
      return Promise.all(
        (await storage.entries())
          .filter(([id, value]) => !isSourceDeletionMarker(id, value))
          .map(([id, stored]) => inventoryEntry(id, stored)),
      );
    },
    inspect,
    subscribeInventory(onChange) {
      return lifecycle.subscribeLocalAndRemote(onChange);
    },
    subscribe(target, onChange) {
      const unsubscribeCurrentness = subscribeToCurrentness(target, onChange);
      const unsubscribeLifecycle = lifecycle.subscribe((change) => {
        if (lifecycleChangeMatches(target, change)) onChange();
      });
      return () => {
        unsubscribeCurrentness();
        unsubscribeLifecycle();
      };
    },
    async open(target) {
      const key = workingSetKey(target);
      const stored = await storage.get(key);
      if (stored === undefined) return absent();
      const schemaVersion = persistedSchemaVersion(stored);
      if (schemaVersion !== undefined && schemaVersion !== 1)
        throw new UnsupportedOfflineWorkingSetSchemaError(schemaVersion);
      const version = persistedManifestVersion(stored);
      if (version === undefined)
        throw new Error("Offline replica record is corrupt");
      requireCompatibleShell(await inspectAppShell(version));
      const { record, migrated } = persistedRecord(stored);
      validateTarget(record, target);
      await validateSnapshot(record);
      if (migrated && !(await persistRecord(key, record))) return absent();
      return reading(record);
    },
    ...progress,
    async retain(target, onProgress = () => undefined) {
      const totalSteps = 2;
      onProgress(0, totalSteps);
      const snapshot = await fetchSnapshot(target);
      validateTarget(snapshot, target);
      await validateSnapshot(snapshot);
      onProgress(1, totalSteps);
      let record: OfflineWorkingSetRecord = {
        ...snapshot,
        schemaVersion: 1,
        retainedAt: now().toISOString(),
        availability:
          snapshot.manifest.serverRetention.state === "ready"
            ? "ready"
            : "partial",
      };
      const retained = await runExclusive(target, async () => {
        record = await mergePendingProgress(record, await read(target));
        return persistRecord(workingSetKey(target), record);
      });
      if (!retained)
        throw new Error(
          "Offline retention is blocked while Source deletion is pending",
        );
      lifecycle.publish(target);
      onProgress(totalSteps, totalSteps);
      const observed = capturedFreshness(snapshot, target);
      observedFreshness.set(workingSetKey(target), observed);
      return inspection(
        record,
        observed,
        await inspectAppShell(record.manifest.version),
      );
    },
    async requestRemoval(target) {
      const pending = await runExclusive(target, async () => {
        const record = await read(target);
        if (!record) return undefined;
        const next = { ...record, availability: "pending-removal" as const };
        return (await persistRecord(workingSetKey(target), next))
          ? next
          : undefined;
      });
      if (!pending) return absent();
      lifecycle.publish(target);
      return inspection(
        pending,
        observedFreshness.get(workingSetKey(target)) ?? "unknown",
        await inspectAppShell(pending.manifest.version),
      );
    },
    async restore(target) {
      const restored = await runExclusive(target, async () => {
        const record = await read(target);
        if (!record) return undefined;
        requirePendingRemoval(record, "restored");
        const next: OfflineWorkingSetRecord = {
          ...record,
          availability:
            record.manifest.serverRetention.state === "ready"
              ? "ready"
              : "partial",
        };
        return (await persistRecord(workingSetKey(target), next))
          ? next
          : undefined;
      });
      if (!restored) return absent();
      lifecycle.publish(target);
      return inspection(
        restored,
        observedFreshness.get(workingSetKey(target)) ?? "unknown",
        await inspectAppShell(restored.manifest.version),
      );
    },
    async confirmRemoval(target) {
      const removed = await runExclusive(target, async () => {
        const record = await read(target);
        if (!record) return false;
        requirePendingRemoval(record, "removed");
        await storage.delete(workingSetKey(target));
        return true;
      });
      if (!removed) return absent();
      observedFreshness.delete(workingSetKey(target));
      lifecycle.publish(target);
      return absent();
    },
    async discardInventoryEntry(id) {
      const target = targetFromWorkingSetKey(id);
      if (target) {
        await runExclusive(target, () => storage.delete(id));
        observedFreshness.delete(id);
        lifecycle.publish(target);
      } else {
        await storage.delete(id);
        lifecycle.publish({});
      }
    },
    removeSource: sourceDeletion.removeSource,
    async reconcileSourceDeletion(sourceId, deleteSource) {
      return sourceDeletion.reconcile(sourceId, deleteSource);
    },
    async expireRetainedBefore(cutoff) {
      const deleted: string[] = [];
      for (const [id] of await storage.entries()) {
        const target = targetFromWorkingSetKey(id);
        if (!target) continue;
        await runExclusive(target, async () => {
          const stored = await storage.get(id);
          try {
            if (stored === undefined) return;
            const { record } = persistedRecord(stored);
            if (new Date(record.retainedAt) >= cutoff) return;
            await storage.delete(id);
            deleted.push(id);
          } catch {
            // Invalid records remain available for deliberate inventory recovery.
          }
        });
      }
      for (const id of deleted) {
        observedFreshness.delete(id);
        const target = targetFromWorkingSetKey(id);
        if (target) lifecycle.publish(target);
      }
      return deleted.length;
    },
  };

  async function inventoryEntry(
    id: string,
    stored: unknown,
  ): Promise<OfflineWorkingSetInventoryEntry> {
    const target = targetFromWorkingSetKey(id);
    if (!target)
      return {
        id,
        status: "corrupt",
        message: "Offline working-set storage identity is corrupt",
      };
    try {
      const schemaVersion = persistedSchemaVersion(stored);
      if (schemaVersion !== undefined && schemaVersion !== 1) {
        return {
          id,
          target,
          status: "unsupported",
          inspection: unsupportedInspection(schemaVersion),
        };
      }
      const version = persistedManifestVersion(stored);
      if (version === undefined)
        throw new Error("Offline replica record is corrupt");
      const shellCompatibility = await inspectAppShell(version);
      if (shellCompatibility.status === "incompatible") {
        return {
          id,
          target,
          status: "incompatible",
          inspection: incompatibleInspection(version, shellCompatibility),
        };
      }
      const { record, migrated } = persistedRecord(stored);
      validateTarget(record, target);
      await validateSnapshot(record);
      if (migrated && !(await persistRecord(id, record)))
        throw new Error("Source deletion is pending");
      const observed = await freshness(record, target);
      const priorFreshness = observedFreshness.get(id);
      observedFreshness.set(id, observed);
      if (priorFreshness !== undefined && priorFreshness !== observed)
        lifecycle.publish(target);
      return {
        id,
        target,
        status: "available",
        inspection: inspection(record, observed, shellCompatibility),
      };
    } catch (error) {
      return {
        id,
        target,
        status: "corrupt",
        message: error instanceof Error ? error.message : "Unknown corruption",
      };
    }
  }
}

function unsupportedInspection(
  schemaVersion: number,
): Extract<OfflineWorkingSetInspection, { status: "unsupported" }> {
  return {
    status: "unsupported",
    localAvailability: "retained",
    schemaVersion,
    message: `Offline working-set schema version ${schemaVersion} is unsupported. Retained data was preserved.`,
  };
}

function incompatibleInspection(
  version: number,
  shellCompatibility: Extract<
    AppShellCompatibility,
    { status: "incompatible" }
  >,
): Extract<OfflineWorkingSetInspection, { status: "incompatible" }> {
  return {
    status: "incompatible",
    localAvailability: "retained",
    persistedVersion: version,
    shellCompatibility,
    message: `${shellCompatibility.reason} Retained data was preserved.`,
  };
}

function inspection(
  record: OfflineWorkingSetRecord,
  freshness: "current" | "outdated" | "unknown",
  shellCompatibility: AppShellCompatibility,
): Extract<OfflineWorkingSetInspection, { status: "available" }> {
  const retainedReadiness = record.manifest.serverRetention.state;
  const readiness =
    shellCompatibility.status === "compatible"
      ? retainedReadiness
      : "unavailable";
  return {
    status: "available",
    localAvailability: "readable",
    freshness,
    removal: record.availability === "pending-removal" ? "pending" : "retained",
    readiness,
    retainedReadiness,
    shellCompatibility,
    activities: offlineActivityReadiness(
      retainedReadiness,
      record.manifest.serverRetention.reasons,
      shellCompatibility,
      progressSynchronization(record),
    ),
    retainedAt: record.retainedAt,
    synchronizedAt: record.manifest.synchronizedAt,
    replicaBytes: record.manifest.replicaBytes,
    referencedResourceBytes: record.manifest.referencedResourceBytes,
    referencedResourceCount: record.manifest.resources.length,
    progressSynchronization: progressSynchronization(record),
  };
}

function capturedFreshness(
  snapshot: OfflineSnapshot,
  target: OfflineWorkingSetTarget,
): "current" | "outdated" {
  const currentActivation = snapshot.replica.workspace.state.derivatives.find(
    (derivative) => derivative.currentActivation,
  )?.currentActivation?.id;
  return snapshot.replica.workspace.source.currentStateId === target.stateId &&
    currentActivation === snapshot.manifest.activeDerivative.activationId
    ? "current"
    : "outdated";
}

function reading(record: OfflineWorkingSetRecord): RetainedReadingWorkspace {
  return {
    status: "available",
    revision: record.manifest.replicaSha256,
    retainedAt: record.retainedAt,
    workspace: record.replica.workspace,
    annotations: record.replica.annotations,
    positions: record.replica.positions,
  };
}

function requirePendingRemoval(
  record: OfflineWorkingSetRecord,
  transition: "removed" | "restored",
) {
  if (record.availability !== "pending-removal") {
    throw new Error(
      `Offline working set must have removal requested before it can be ${transition}`,
    );
  }
}

function absent() {
  return { status: "absent" as const };
}

function requireCompatibleShell(compatibility: AppShellCompatibility) {
  if (compatibility.status === "compatible") return;
  throw new AppShellCompatibilityError(
    `${compatibility.reason} Retained data was preserved.`,
  );
}
