/** A small key-value cache in IndexedDB for data fetched from public services. */

const DB_NAME = 'bikepacking-cache';
const STORE = 'overpass';

let db: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

interface Entry<T> {
  key: string;
  fetchedAt: number;
  value: T;
}

/** The cached value if it is younger than `maxAgeMs`. */
export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  const d = await open();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => {
        const e = req.result as Entry<T> | undefined;
        resolve(e && 'value' in e && Date.now() - e.fetchedAt < maxAgeMs ? e.value : undefined);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  const d = await open();
  if (!d) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, fetchedAt: Date.now(), value } satisfies Entry<T>);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
