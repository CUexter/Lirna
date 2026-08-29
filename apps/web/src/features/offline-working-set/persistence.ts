import type { InquiryOutputs } from "@/clients/inquiry";
import type { OfflineWorkingSetTarget } from "./workingSets";

export type OfflineSnapshot = InquiryOutputs["sources"]["offlineManifest"];

export interface OfflineWorkingSetRecord extends OfflineSnapshot {
  schemaVersion: 1;
  retainedAt: string;
  availability: "ready" | "partial" | "stale" | "pending-removal";
  pendingProgress?: PendingReadingProgress[];
}

type ReadingPosition = NonNullable<InquiryOutputs["sources"]["resume"]["get"]>;

export interface PendingReadingProgress {
  position: ReadingPosition;
  synchronization: "pending" | "failed";
  message?: string;
}

export class UnsupportedOfflineWorkingSetSchemaError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Offline working-set schema version ${schemaVersion} is unsupported`);
  }
}

export function persistedRecord(value: unknown): {
  record: OfflineWorkingSetRecord;
  migrated: boolean;
} {
  if (!isRecord(value)) throw new Error("Offline replica record is corrupt");
  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    if (typeof schemaVersion !== "number")
      throw new Error("Offline working-set schema version is corrupt");
    throw new UnsupportedOfflineWorkingSetSchemaError(schemaVersion);
  }
  const candidate = value as Partial<OfflineWorkingSetRecord>;
  validateRecord(candidate);
  return {
    record: {
      ...(candidate as Omit<OfflineWorkingSetRecord, "schemaVersion">),
      schemaVersion: 1,
    },
    migrated: schemaVersion === undefined,
  };
}

export function persistedSchemaVersion(value: unknown) {
  if (!isRecord(value) || value.schemaVersion === undefined) return undefined;
  if (typeof value.schemaVersion !== "number")
    throw new Error("Offline working-set schema version is corrupt");
  return value.schemaVersion;
}

export function persistedManifestVersion(value: unknown) {
  if (!isRecord(value) || !isRecord(value.manifest)) return undefined;
  return typeof value.manifest.version === "number"
    ? value.manifest.version
    : undefined;
}

export function workingSetKey(target: OfflineWorkingSetTarget) {
  return `${target.sourceId}:${target.stateId}`;
}

export function sourceDeletionKey(sourceId: string) {
  return `source-deletion:${sourceId}`;
}

export function targetFromWorkingSetKey(
  key: string,
): OfflineWorkingSetTarget | undefined {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) return undefined;
  return {
    sourceId: key.slice(0, separator),
    stateId: key.slice(separator + 1),
  };
}

export function validateTarget(
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

export async function validateSnapshot(snapshot: OfflineSnapshot) {
  const replicaHash = await sha256(JSON.stringify(snapshot.replica));
  if (replicaHash !== snapshot.manifest.replicaSha256) {
    throw new Error(
      "Offline typed Reading replica failed local SHA-256 validation",
    );
  }
}

export async function refreshReplicaIntegrity<T extends OfflineSnapshot>(
  snapshot: T,
): Promise<T> {
  const serialized = JSON.stringify(snapshot.replica);
  return {
    ...snapshot,
    manifest: {
      ...snapshot.manifest,
      replicaBytes: new TextEncoder().encode(serialized).byteLength,
      replicaSha256: await sha256(serialized),
    },
  };
}

function validateRecord(candidate: Partial<OfflineWorkingSetRecord>) {
  if (
    !validManifest(candidate.manifest) ||
    typeof candidate.retainedAt !== "string" ||
    !validReplica(candidate.replica) ||
    !validPendingProgress(candidate.pendingProgress, candidate.manifest) ||
    !validAvailability(candidate.availability)
  ) {
    throw new Error("Offline replica record version is unsupported or corrupt");
  }
}

function validManifest(manifest: unknown) {
  return (
    isRecord(manifest) &&
    manifest.version === 1 &&
    typeof manifest.sourceId === "string" &&
    typeof manifest.stateId === "string" &&
    Array.isArray(manifest.resources) &&
    isRecord(manifest.activeDerivative) &&
    isRecord(manifest.serverRetention) &&
    typeof manifest.replicaBytes === "number" &&
    typeof manifest.referencedResourceBytes === "number" &&
    typeof manifest.replicaSha256 === "string"
  );
}

function validReplica(replica: unknown) {
  return (
    isRecord(replica) &&
    Array.isArray(replica.annotations) &&
    Array.isArray(replica.positions) &&
    isRecord(replica.workspace) &&
    isRecord(replica.workspace.state) &&
    Array.isArray(replica.workspace.state.resources)
  );
}

function validAvailability(availability: unknown) {
  return ["ready", "partial", "stale", "pending-removal"].includes(
    String(availability),
  );
}

function validPendingProgress(pendingProgress: unknown, manifest: unknown) {
  if (pendingProgress === undefined) return true;
  if (!Array.isArray(pendingProgress) || !isRecord(manifest)) return false;
  return pendingProgress.every((pending) => {
    if (!isRecord(pending) || !isRecord(pending.position)) return false;
    const position = pending.position;
    return (
      ["pending", "failed"].includes(String(pending.synchronization)) &&
      (pending.message === undefined || typeof pending.message === "string") &&
      position.sourceId === manifest.sourceId &&
      position.stateId === manifest.stateId &&
      typeof position.componentIdentity === "string" &&
      typeof position.componentLabel === "string" &&
      typeof position.scrollTop === "number" &&
      typeof position.savedAt === "string"
    );
  });
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
