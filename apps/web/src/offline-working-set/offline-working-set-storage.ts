export interface OfflineWorkingSetStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const databaseName = "lirna-offline-working-sets";
const storeName = "working-sets";

export const indexedDbOfflineWorkingSetStorage: OfflineWorkingSetStorage = {
  get: (key) => request<unknown>("readonly", (store) => store.get(key)),
  put: (key, value) =>
    request("readwrite", (store) => store.put(value, key)).then(
      () => undefined,
    ),
  delete: (key) => request("readwrite", (store) => store.delete(key)),
};

export function createMemoryOfflineWorkingSetStorage(
  records: Map<string, unknown>,
): OfflineWorkingSetStorage {
  return {
    async delete(key) {
      records.delete(key);
    },
    async get(key) {
      return records.get(key);
    },
    async put(key, value) {
      records.set(key, value);
    },
  };
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
