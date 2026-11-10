import type { Entity, Trip } from '../../model/types';
import type { Commit } from '../history/diff';

const DB_NAME = 'bikepacking-planner';
const DB_VERSION = 2;
const ENTITIES = 'entities';
const HISTORY = 'history';

/** A commit as kept in this browser: `synced` once the server has it. */
export type StoredCommit = Commit & { synced: boolean };

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Opens the database, upgrading it if needed. While another tab with an older version keeps it
 * open, the upgrade waits: `onBlocked` is called, and the promise resolves once that tab closes.
 * `onReplaced` is called in this tab when a newer version needs the database: it closes it.
 */
export function openDb(hooks: { onBlocked?: () => void; onReplaced?: () => void } = {}): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTITIES)) {
        const store = db.createObjectStore(ENTITIES, { keyPath: 'id' });
        store.createIndex('tripId', 'tripId');
        store.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains(HISTORY)) {
        db.createObjectStore(HISTORY, { keyPath: 'id' }).createIndex('tripId', 'tripId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        hooks.onReplaced?.();
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => hooks.onBlocked?.();
  });
}

export async function loadTripEntities(db: IDBDatabase, tripId: string): Promise<Entity[]> {
  const tx = db.transaction(ENTITIES, 'readonly');
  return promisify(tx.objectStore(ENTITIES).index('tripId').getAll(tripId) as IDBRequest<Entity[]>);
}

export async function listTrips(db: IDBDatabase): Promise<Trip[]> {
  const tx = db.transaction(ENTITIES, 'readonly');
  const trips = await promisify(tx.objectStore(ENTITIES).index('type').getAll('trip') as IDBRequest<Trip[]>);
  return trips.filter((t) => !t.deleted);
}

export function putEntities(db: IDBDatabase, entities: Entity[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTITIES, 'readwrite');
    const store = tx.objectStore(ENTITIES);
    for (const e of entities) {
      try {
        store.put(e);
      } catch {
        // Not structured-cloneable (e.g. a reactive proxy slipped in): store a plain copy.
        store.put(JSON.parse(JSON.stringify(e)) as Entity);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function putCommits(db: IDBDatabase, commits: StoredCommit[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY, 'readwrite');
    const store = tx.objectStore(HISTORY);
    for (const c of commits) store.put(JSON.parse(JSON.stringify(c)) as StoredCommit);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The trip's commits kept in this browser, newest first. */
export async function listCommits(db: IDBDatabase, tripId: string): Promise<StoredCommit[]> {
  const tx = db.transaction(HISTORY, 'readonly');
  const all = await promisify(tx.objectStore(HISTORY).index('tripId').getAll(tripId) as IDBRequest<StoredCommit[]>);
  return all.sort((a, b) => b.at - a.at);
}
