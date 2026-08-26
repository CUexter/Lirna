import { expect, test } from "bun:test";

import { readingWorkspaceFixture } from "@/components/reading-workspace/source-information-test-fixture";
import {
  confirmOfflineWorkingSetRemoval,
  markOfflineWorkingSetStale,
  type OfflineSnapshot,
  type OfflineWorkingSetRecord,
  type OfflineWorkingSetStorage,
  readOfflineWorkingSet,
  requestOfflineWorkingSetRemoval,
  restoreOfflineWorkingSet,
  retainOfflineWorkingSet,
  validateSnapshot,
} from "./offline-working-set-store";

test("validates the replica payload and each retained Source resource locally", async () => {
  const snapshot = await fixture();
  await expect(validateSnapshot(snapshot)).resolves.toBeUndefined();

  snapshot.replica.workspace.state.resources[0].sha256 = "f".repeat(64);
  await expect(validateSnapshot(snapshot)).rejects.toThrow(
    "payload failed local SHA-256 validation",
  );
});

test("rejects resource metadata that disagrees with a valid replica payload", async () => {
  const snapshot = await fixture();
  snapshot.manifest.resources[0].byteLength += 1;
  await expect(validateSnapshot(snapshot)).rejects.toThrow(
    "Source resource failed local integrity validation",
  );
});

test("persists stale and recoverable removal transitions without deleting the replica", async () => {
  const records = new Map<string, OfflineWorkingSetRecord>();
  const storage = memoryStorage(records);
  const progress: Array<[number, number]> = [];
  const retained = await retainOfflineWorkingSet(
    await fixture(),
    (completed, total) => progress.push([completed, total]),
    storage,
  );
  expect(progress.at(0)).toEqual([0, 3]);
  expect(progress.at(-1)).toEqual([3, 3]);
  await expect(
    readOfflineWorkingSet(
      retained.manifest.sourceId,
      retained.manifest.stateId,
      storage,
    ),
  ).resolves.toMatchObject({ availability: "ready" });

  const stale = await markOfflineWorkingSetStale(retained, storage);
  expect(stale.availability).toBe("stale");
  const pending = await requestOfflineWorkingSetRemoval(stale, storage);
  expect(pending.availability).toBe("pending-removal");
  const restored = await restoreOfflineWorkingSet(pending, storage);
  expect(restored.availability).toBe("ready");

  await confirmOfflineWorkingSetRemoval(
    restored.manifest.sourceId,
    restored.manifest.stateId,
    storage,
  );
  expect(records.size).toBe(0);
});

test("uses the IndexedDB adapter for the durable Client replica", async () => {
  const original = globalThis.indexedDB;
  const records = new Map<IDBValidKey, unknown>();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDb(records),
  });
  try {
    const retained = await retainOfflineWorkingSet(await fixture());
    await expect(
      readOfflineWorkingSet(
        retained.manifest.sourceId,
        retained.manifest.stateId,
      ),
    ).resolves.toMatchObject({ availability: "ready" });
    await confirmOfflineWorkingSetRemoval(
      retained.manifest.sourceId,
      retained.manifest.stateId,
    );
    await expect(
      readOfflineWorkingSet(
        retained.manifest.sourceId,
        retained.manifest.stateId,
      ),
    ).resolves.toBeUndefined();
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: original,
    });
  }
});

test("rejects unsupported persisted replica versions", async () => {
  const storage: OfflineWorkingSetStorage = {
    async get() {
      return { manifest: { version: 2 } };
    },
    async put() {},
    async delete() {},
  };
  await expect(
    readOfflineWorkingSet("source", "state", storage),
  ).rejects.toThrow("version is unsupported or corrupt");
});

test("rejects foreign replica content under a matching Source-state manifest", async () => {
  const record: OfflineWorkingSetRecord = {
    ...(await fixture()),
    retainedAt: "2026-08-26T12:00:00.000Z",
    availability: "ready",
  };
  record.replica.workspace.state.sourceId = "foreign-source";
  record.manifest.payloadSha256 = await hash(JSON.stringify(record.replica));
  const { sourceId, stateId } = record.manifest;
  const records = new Map<string, OfflineWorkingSetRecord>([
    [`${sourceId}:${stateId}`, record],
  ]);

  await expect(
    readOfflineWorkingSet(sourceId, stateId, memoryStorage(records)),
  ).rejects.toThrow("does not match the requested Source state");
});

function fakeIndexedDb(records: Map<IDBValidKey, unknown>) {
  const store = {
    get(key: IDBValidKey) {
      return fakeRequest(records.get(key));
    },
    put(value: unknown, key: IDBValidKey) {
      records.set(key, value);
      return fakeRequest(key);
    },
    delete(key: IDBValidKey) {
      records.delete(key);
      return fakeRequest(undefined);
    },
  } as IDBObjectStore;
  const database = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => store,
    transaction: () => {
      const transaction = {
        error: null,
        objectStore: () => store,
      } as unknown as IDBTransaction;
      queueMicrotask(() =>
        queueMicrotask(() => transaction.oncomplete?.({} as Event)),
      );
      return transaction;
    },
    close: () => undefined,
  } as unknown as IDBDatabase;
  return {
    open() {
      const request = { result: database } as IDBOpenDBRequest;
      queueMicrotask(() => {
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.({} as Event);
      });
      return request;
    },
  } as unknown as IDBFactory;
}

function fakeRequest<T>(value: T) {
  const request = { result: value } as IDBRequest<T>;
  queueMicrotask(() => request.onsuccess?.({} as Event));
  return request;
}

function memoryStorage(
  records: Map<string, OfflineWorkingSetRecord>,
): OfflineWorkingSetStorage {
  return {
    async get(key) {
      return records.get(key);
    },
    async put(key, record) {
      records.set(key, record);
    },
    async delete(key) {
      records.delete(key);
    },
  };
}

async function fixture(): Promise<OfflineSnapshot> {
  const workspace = readingWorkspaceFixture();
  if (!workspace.state) throw new Error("Fixture requires a first-class state");
  const firstClassWorkspace = { ...workspace, state: workspace.state };
  const replica = {
    workspace: firstClassWorkspace,
    annotations: [],
    positions: [],
  };
  const resource = workspace.state.resources[0];
  const activation = workspace.state.derivatives[0]?.currentActivation;
  if (!(resource && activation))
    throw new Error("Fixture requires retention data");
  return {
    manifest: {
      version: 1,
      sourceId: firstClassWorkspace.source.id,
      stateId: firstClassWorkspace.state.id,
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
      totalBytes: 100,
      payloadSha256: await hash(JSON.stringify(replica)),
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
