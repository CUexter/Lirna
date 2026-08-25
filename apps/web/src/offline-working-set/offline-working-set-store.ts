import type { InquiryOutputs } from "@/clients/inquiry";

export type OfflineSnapshot = InquiryOutputs["sources"]["offlineManifest"];

export interface OfflineWorkingSetRecord extends OfflineSnapshot {
  retainedAt: string;
  availability: "ready" | "partial" | "stale" | "pending-removal";
  lastError?: string;
}

export interface OfflineWorkingSetStorage {
  get(key: string): Promise<unknown>;
  put(key: string, record: OfflineWorkingSetRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

const databaseName = "lirna-offline-working-sets";
const storeName = "working-sets";

function workingSetKey(sourceId: string, stateId: string) {
  return `${sourceId}:${stateId}`;
}

export async function retainOfflineWorkingSet(
  snapshot: OfflineSnapshot,
  onProgress: (completed: number, total: number) => void = () => undefined,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  const total = snapshot.manifest.resources.length + 1;
  const persistedTotal = total + 1;
  onProgress(0, persistedTotal);
  await validateSnapshot(snapshot, (completed) =>
    onProgress(completed, persistedTotal),
  );
  const record: OfflineWorkingSetRecord = {
    ...snapshot,
    retainedAt: new Date().toISOString(),
    availability:
      snapshot.manifest.serverRetention.state === "ready" ? "ready" : "partial",
  };
  await writeRecord(record, storage);
  onProgress(persistedTotal, persistedTotal);
  return record;
}

export async function validateSnapshot(
  snapshot: OfflineSnapshot,
  onProgress: (completed: number) => void = () => undefined,
) {
  const payloadHash = await sha256(JSON.stringify(snapshot.replica));
  if (payloadHash !== snapshot.manifest.payloadSha256) {
    throw new Error("Offline replica payload failed local SHA-256 validation");
  }
  onProgress(1);
  const resources = new Map(
    snapshot.replica.workspace.state.resources.map((resource) => [
      resource.identity,
      resource,
    ]),
  );
  for (const [index, expected] of snapshot.manifest.resources.entries()) {
    const resource = resources.get(expected.identity);
    if (
      !resource ||
      resource.sha256 !== expected.sha256 ||
      resource.byteLength !== expected.byteLength
    ) {
      throw new Error(
        `Offline Source resource failed local integrity validation: ${expected.identity}`,
      );
    }
    onProgress(index + 2);
  }
}

export async function readOfflineWorkingSet(
  sourceId: string,
  stateId: string,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  const stored = await storage.get(workingSetKey(sourceId, stateId));
  if (stored === undefined) return undefined;
  const record = persistedRecord(stored);
  await validateSnapshot(record);
  return record;
}

export async function markOfflineWorkingSetStale(
  record: OfflineWorkingSetRecord,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  const stale = { ...record, availability: "stale" as const };
  await writeRecord(stale, storage);
  return stale;
}

export async function requestOfflineWorkingSetRemoval(
  record: OfflineWorkingSetRecord,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  const pending = { ...record, availability: "pending-removal" as const };
  await writeRecord(pending, storage);
  return pending;
}

export async function restoreOfflineWorkingSet(
  record: OfflineWorkingSetRecord,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  const restored = {
    ...record,
    availability:
      record.manifest.serverRetention.state === "ready"
        ? ("ready" as const)
        : ("partial" as const),
  };
  await writeRecord(restored, storage);
  return restored;
}

export async function confirmOfflineWorkingSetRemoval(
  sourceId: string,
  stateId: string,
  storage: OfflineWorkingSetStorage = indexedDbStorage,
) {
  await storage.delete(workingSetKey(sourceId, stateId));
}

async function writeRecord(
  record: OfflineWorkingSetRecord,
  storage: OfflineWorkingSetStorage,
) {
  await storage.put(
    workingSetKey(record.manifest.sourceId, record.manifest.stateId),
    record,
  );
}

const indexedDbStorage: OfflineWorkingSetStorage = {
  get: (key) => request<unknown>("readonly", (store) => store.get(key)),
  put: (key, record) =>
    request("readwrite", (store) => store.put(record, key)).then(
      () => undefined,
    ),
  delete: (key) => request("readwrite", (store) => store.delete(key)),
};

async function request<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const result = operation(transaction.objectStore(storeName));
    let value: T;
    result.onsuccess = () => {
      value = result.result;
    };
    const fail = () => {
      database.close();
      reject(
        transaction.error ?? result.error ?? new Error("IndexedDB failed"),
      );
    };
    result.onerror = fail;
    transaction.onerror = fail;
    transaction.onabort = fail;
    transaction.oncomplete = () => {
      database.close();
      resolve(value);
    };
  });
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
    typeof manifest.payloadSha256 !== "string" ||
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline storage is unavailable"));
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
