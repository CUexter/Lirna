import type { InquiryOutputs } from "@/clients/inquiry";
import { inquiry } from "@/clients/inquiry";
import { queryClient } from "@/utils/query-client";
import type {
  OfflineWorkingSetCurrentness,
  OfflineWorkingSetInspection,
  OfflineWorkingSets,
  OfflineWorkingSetTarget,
  RetainedReadingWorkspace,
} from "./offline-working-set";
import {
  indexedDbOfflineWorkingSetStorage,
  type OfflineWorkingSetStorage,
} from "./offline-working-set-storage";

export type OfflineSnapshot = InquiryOutputs["sources"]["offlineManifest"];

interface OfflineWorkingSetRecord extends OfflineSnapshot {
  retainedAt: string;
  availability: "ready" | "partial" | "stale" | "pending-removal";
}

interface OfflineWorkingSetDependencies {
  fetchSnapshot(target: OfflineWorkingSetTarget): Promise<OfflineSnapshot>;
  now(): Date;
  storage: OfflineWorkingSetStorage;
}

export function createBrowserOfflineWorkingSets() {
  return createOfflineWorkingSets({
    fetchSnapshot: (target) =>
      queryClient.fetchQuery(
        inquiry.sources.offlineManifest.queryOptions({
          input: target,
          staleTime: 0,
        }),
      ),
    now: () => new Date(),
    storage: indexedDbOfflineWorkingSetStorage,
  });
}

export function createOfflineWorkingSets({
  fetchSnapshot,
  now,
  storage,
}: OfflineWorkingSetDependencies): OfflineWorkingSets {
  async function read(target: OfflineWorkingSetTarget) {
    const stored = await storage.get(workingSetKey(target));
    if (stored === undefined) return undefined;
    const record = persistedRecord(stored);
    validateTarget(record, target);
    await validateSnapshot(record);
    return record;
  }

  async function inspect(
    target: OfflineWorkingSetTarget,
    currentness?: OfflineWorkingSetCurrentness,
  ) {
    let record = await read(target);
    if (!record) return absent();
    if (
      record.availability !== "pending-removal" &&
      isStale(record, target, currentness)
    ) {
      record = { ...record, availability: "stale" };
      await writeRecord(record, storage);
    }
    return inspection(record);
  }

  return {
    inspect,
    async open(target) {
      const record = await read(target);
      return record ? reading(record) : absent();
    },
    async retain(target, onProgress = () => undefined) {
      const totalSteps = 2;
      onProgress(0, totalSteps);
      const snapshot = await fetchSnapshot(target);
      validateTarget(snapshot, target);
      await validateSnapshot(snapshot);
      onProgress(1, totalSteps);
      const record: OfflineWorkingSetRecord = {
        ...snapshot,
        retainedAt: now().toISOString(),
        availability:
          snapshot.manifest.serverRetention.state === "ready"
            ? "ready"
            : "partial",
      };
      await writeRecord(record, storage);
      onProgress(totalSteps, totalSteps);
      return inspection(record);
    },
    async requestRemoval(target) {
      const record = await read(target);
      if (!record) return absent();
      const pending = { ...record, availability: "pending-removal" as const };
      await writeRecord(pending, storage);
      return inspection(pending);
    },
    async restore(target) {
      const record = await read(target);
      if (!record) return absent();
      requirePendingRemoval(record, "restored");
      const restored: OfflineWorkingSetRecord = {
        ...record,
        availability:
          record.manifest.serverRetention.state === "ready"
            ? "ready"
            : "partial",
      };
      await writeRecord(restored, storage);
      return inspection(restored);
    },
    async confirmRemoval(target) {
      const record = await read(target);
      if (!record) return absent();
      requirePendingRemoval(record, "removed");
      await storage.delete(workingSetKey(target));
      return absent();
    },
  };
}

function inspection(
  record: OfflineWorkingSetRecord,
): OfflineWorkingSetInspection {
  return {
    status: "available",
    availability: record.availability,
    retainedAt: record.retainedAt,
    synchronizedAt: record.manifest.synchronizedAt,
    replicaBytes: record.manifest.replicaBytes,
    referencedResourceBytes: record.manifest.referencedResourceBytes,
    referencedResourceCount: record.manifest.resources.length,
    reasons: record.manifest.serverRetention.reasons,
  };
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

function isStale(
  record: OfflineWorkingSetRecord,
  target: OfflineWorkingSetTarget,
  currentness?: OfflineWorkingSetCurrentness,
) {
  return Boolean(
    (currentness?.activationId &&
      record.manifest.activeDerivative.activationId !==
        currentness.activationId) ||
      (currentness?.currentStateId &&
        currentness.currentStateId !== target.stateId),
  );
}

function validateTarget(
  snapshot: OfflineSnapshot,
  target: OfflineWorkingSetTarget,
) {
  if (
    snapshot.manifest.sourceId !== target.sourceId ||
    snapshot.manifest.stateId !== target.stateId ||
    !replicaMatchesTarget(snapshot, target)
  ) {
    throw new Error(
      "Offline replica record does not match the requested Source state",
    );
  }
}

function replicaMatchesTarget(
  snapshot: OfflineSnapshot,
  target: OfflineWorkingSetTarget,
) {
  const { workspace, annotations, positions } = snapshot.replica;
  return (
    workspace.source.id === target.sourceId &&
    workspace.state.id === target.stateId &&
    workspace.state.sourceId === target.sourceId &&
    workspace.reading.source.id === target.sourceId &&
    workspace.reading.source.stateId === target.stateId &&
    annotations.every(
      (annotation) =>
        annotation.sourceId === target.sourceId &&
        annotation.sourceStateId === target.stateId,
    ) &&
    positions.every(
      (position) =>
        position.sourceId === target.sourceId &&
        position.stateId === target.stateId &&
        (!position.semanticLocation ||
          (position.semanticLocation.source.sourceId === target.sourceId &&
            position.semanticLocation.source.stateId === target.stateId)),
    )
  );
}

async function validateSnapshot(snapshot: OfflineSnapshot) {
  const replicaHash = await sha256(JSON.stringify(snapshot.replica));
  if (replicaHash !== snapshot.manifest.replicaSha256) {
    throw new Error(
      "Offline typed Reading replica failed local SHA-256 validation",
    );
  }
}

function workingSetKey(target: OfflineWorkingSetTarget) {
  return `${target.sourceId}:${target.stateId}`;
}

async function writeRecord(
  record: OfflineWorkingSetRecord,
  storage: OfflineWorkingSetStorage,
) {
  await storage.put(
    workingSetKey({
      sourceId: record.manifest.sourceId,
      stateId: record.manifest.stateId,
    }),
    record,
  );
}

function persistedRecord(value: unknown): OfflineWorkingSetRecord {
  if (!isRecord(value)) throw new Error("Offline replica record is corrupt");
  const candidate = value as Partial<OfflineWorkingSetRecord>;
  const availability = candidate.availability;
  const manifest = candidate.manifest;
  const replica = candidate.replica;
  if (
    !isRecord(manifest) ||
    manifest.version !== 1 ||
    typeof manifest.sourceId !== "string" ||
    typeof manifest.stateId !== "string" ||
    !Array.isArray(manifest.resources) ||
    !isRecord(manifest.activeDerivative) ||
    !isRecord(manifest.serverRetention) ||
    typeof manifest.replicaBytes !== "number" ||
    typeof manifest.referencedResourceBytes !== "number" ||
    typeof manifest.replicaSha256 !== "string" ||
    !isRecord(replica) ||
    !Array.isArray(replica.annotations) ||
    !Array.isArray(replica.positions) ||
    !isRecord(replica.workspace) ||
    !isRecord(replica.workspace.state) ||
    !Array.isArray(replica.workspace.state.resources) ||
    !["ready", "partial", "stale", "pending-removal"].includes(
      availability ?? "",
    )
  ) {
    throw new Error("Offline replica record version is unsupported or corrupt");
  }
  return candidate as OfflineWorkingSetRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
