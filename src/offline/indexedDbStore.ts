import type { DurableStore } from './types';

/**
 * Real IndexedDB-backed `DurableStore` — the one that actually runs in
 * a technician's/surveyor's browser in the field. Uses the raw
 * `indexedDB` browser API directly (no added dependency) rather than a
 * wrapper library, since this repository's `package.json` does not
 * already depend on one and this is a small, self-contained amount of
 * IndexedDB code.
 *
 * One object store per logical collection (`dbName`), keyed by `id`.
 */
export function createIndexedDbStore<T extends { id: string }>(dbName: string, storeName = 'items'): DurableStore<T> {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore<R>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async put(item) { await withStore('readwrite', store => store.put(item)); },
    async get(id) {
      const result = await withStore<T | undefined>('readonly', store => store.get(id));
      return result ?? null;
    },
    async list() {
      return withStore<T[]>('readonly', store => store.getAll());
    },
    async delete(id) { await withStore('readwrite', store => store.delete(id)); },
  };
}
