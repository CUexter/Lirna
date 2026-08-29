import type { InquiryOutputs } from "@/clients/inquiry";
import type {
  OfflineWorkingSetInspection,
  OfflineWorkingSets,
  OfflineWorkingSetTarget,
  RetainedReadingWorkspace,
} from "./offline-working-set";
import { offlineActivityReadiness } from "./offline-working-set-activities";
import type { OfflineWorkingSetStorage } from "./offline-working-set-storage";

export type OfflineSnapshot = InquiryOutputs["sources"]["offlineManifest"];

interface OfflineWorkingSetRecord extends OfflineSnapshot {
  retainedAt: string;
  availability: "ready" | "partial" | "stale" | "pending-removal";
}

interface OfflineWorkingSetDependencies {
  fetchSnapshot(target: OfflineWorkingSetTarget): Promise<OfflineSnapshot>;
  fetchCurrentness(target: OfflineWorkingSetTarget): Promise<{
    activationId?: string;
    currentStateId?: string;
  }>;
  now(): Date;
  storage: OfflineWorkingSetStorage;
  subscribeToCurrentness(
    target: OfflineWorkingSetTarget,
    onChange: () => void,
  ): () => void;
}

export function createOfflineWorkingSets({
  fetchSnapshot,
  fetchCurrentness,
  now,
  storage,
  subscribeToCurrentness,
}: OfflineWorkingSetDependencies): OfflineWorkingSets {
  const observedFreshness = new Map<
    string,
    "current" | "outdated" | "unknown"
  >();

  async function read(target: OfflineWorkingSetTarget) {
    const stored = await storage.get(workingSetKey(target));
    if (stored === undefined) return undefined;
    const record = persistedRecord(stored);
    validateTarget(record, target);
    await validateSnapshot(record);
    return record;
  }

  async function inspect(target: OfflineWorkingSetTarget) {
    const record = await read(target);
    if (!record) return absent();
    const observed = await freshness(record, target);
    observedFreshness.set(workingSetKey(target), observed);
    return inspection(record, observed);
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
    inspect,
    subscribe: subscribeToCurrentness,
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
      const observed = capturedFreshness(snapshot, target);
      observedFreshness.set(workingSetKey(target), observed);
      return inspection(record, observed);
    },
    async requestRemoval(target) {
      const record = await read(target);
      if (!record) return absent();
      const pending = { ...record, availability: "pending-removal" as const };
      await writeRecord(pending, storage);
      return inspection(
        pending,
        observedFreshness.get(workingSetKey(target)) ?? "unknown",
      );
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
      return inspection(
        restored,
        observedFreshness.get(workingSetKey(target)) ?? "unknown",
      );
    },
    async confirmRemoval(target) {
      const record = await read(target);
      if (!record) return absent();
      requirePendingRemoval(record, "removed");
      await storage.delete(workingSetKey(target));
      observedFreshness.delete(workingSetKey(target));
      return absent();
    },
  };
}

function inspection(
  record: OfflineWorkingSetRecord,
  freshness: "current" | "outdated" | "unknown",
): OfflineWorkingSetInspection {
  const readiness = record.manifest.serverRetention.state;
  return {
    status: "available",
    localAvailability: "readable",
    freshness,
    removal: record.availability === "pending-removal" ? "pending" : "retained",
    readiness,
    activities: offlineActivityReadiness(
      readiness,
      record.manifest.serverRetention.reasons,
    ),
    retainedAt: record.retainedAt,
    synchronizedAt: record.manifest.synchronizedAt,
    replicaBytes: record.manifest.replicaBytes,
    referencedResourceBytes: record.manifest.referencedResourceBytes,
    referencedResourceCount: record.manifest.resources.length,
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
