import type { Entity, Trip } from '../../model/types';

const DB_NAME = 'bikepacking-planner';
const DB_VERSION = 1;
const ENTITIES = 'entities';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
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
