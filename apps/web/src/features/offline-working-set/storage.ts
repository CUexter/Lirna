export interface OfflineWorkingSetStorage {
  get(key: string): Promise<unknown>;
  entries(): Promise<Array<[string, unknown]>>;
  put(key: string, value: unknown): Promise<void>;
  putUnless(key: string, value: unknown, blockingKey: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deleteMatching(
    predicate: (key: string, value: unknown) => boolean,
  ): Promise<string[]>;
}

const databaseName = "lirna-offline-working-sets";
const storeName = "working-sets";

export const indexedDbOfflineWorkingSetStorage: OfflineWorkingSetStorage = {
  entries: readEntries,
  get: (key) => request<unknown>("readonly", (store) => store.get(key)),
  put: (key, value) =>
    request("readwrite", (store) => store.put(value, key)).then(
      () => undefined,
    ),
  putUnless: putUnlessBlocked,
  delete: (key) => request("readwrite", (store) => store.delete(key)),
  deleteMatching: deleteMatchingEntries,
};

export function createMemoryOfflineWorkingSetStorage(
  records: Map<string, unknown>,
): OfflineWorkingSetStorage {
  return {
    async delete(key) {
      records.delete(key);
    },
    async deleteMatching(predicate) {
      const deleted: string[] = [];
      for (const [key, value] of records) {
        if (!predicate(key, value)) continue;
        records.delete(key);
        deleted.push(key);
      }
      return deleted;
    },
    async get(key) {
      return records.get(key);
    },
    async entries() {
      return [...records.entries()];
    },
    async put(key, value) {
      records.set(key, value);
    },
    async putUnless(key, value, blockingKey) {
      if (records.has(blockingKey)) return false;
      records.set(key, value);
      return true;
    },
  };
}

async function putUnlessBlocked(
  key: string,
  value: unknown,
  blockingKey: string,
) {
  const database = await openDatabase();
  return new Promise<boolean>((resolve, reject) => {
    let stored = false;
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const blocker = store.get(blockingKey);
    blocker.onsuccess = () => {
      if (blocker.result !== undefined) return;
      store.put(value, key);
      stored = true;
    };
    const fail = () => {
      database.close();
      reject(
        transaction.error ?? blocker.error ?? new Error("IndexedDB failed"),
      );
    };
    blocker.onerror = fail;
    transaction.onerror = fail;
    transaction.onabort = fail;
    transaction.oncomplete = () => {
      database.close();
      resolve(stored);
    };
  });
}

async function readEntries() {
  return scanEntries("readonly", (cursor) =>
    typeof cursor.key === "string"
      ? ([cursor.key, cursor.value] as [string, unknown])
      : undefined,
  );
}

async function deleteMatchingEntries(
  predicate: (key: string, value: unknown) => boolean,
) {
  return scanEntries("readwrite", (cursor) => {
    if (typeof cursor.key === "string" && predicate(cursor.key, cursor.value)) {
      cursor.delete();
      return cursor.key;
    }
    return undefined;
  });
}

async function scanEntries<T>(
  mode: IDBTransactionMode,
  visit: (cursor: IDBCursorWithValue) => T | undefined,
) {
  const database = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const values: T[] = [];
    const transaction = database.transaction(storeName, mode);
    const cursorRequest = transaction.objectStore(storeName).openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const value = visit(cursor);
      if (value !== undefined) values.push(value);
      cursor.continue();
    };
    const fail = () => {
      database.close();
      reject(
        transaction.error ??
          cursorRequest.error ??
          new Error("IndexedDB failed"),
      );
    };
    cursorRequest.onerror = fail;
    transaction.onerror = fail;
    transaction.onabort = fail;
    transaction.oncomplete = () => {
      database.close();
      resolve(values);
    };
  });
}

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
