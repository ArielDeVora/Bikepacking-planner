import { writable, type Readable } from 'svelte/store';
import type { OsmCategory } from '../../config/pois';
import { buildQuery, parseElements, type OsmPlace, type Tile } from './overpass';

// Public instance: about 10,000 requests and 1 GB a day per user. Requests go one at a time,
// at least MIN_GAP_MS apart, and every tile is cached for TTL_MS.
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MIN_GAP_MS = 1500;
const TTL_MS = 14 * 24 * 3600 * 1000;
const TIMEOUT_MS = 40_000;
/** After a failure, wait this long, doubling with each further failure (as the server asks). */
const BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000;

const DB_NAME = 'bikepacking-cache';
const STORE = 'overpass';

interface CacheEntry {
  key: string;
  fetchedAt: number;
  places: OsmPlace[];
}

export interface LoaderState {
  queued: number;
  busyUntil: number;
  error: string | null;
}

export interface Transport {
  query(q: string): Promise<{ elements?: unknown[] }>;
  sleep(ms: number): Promise<void>;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Overpass HTTP ${status}`);
  }
}

const http: Transport = {
  async query(q) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctrl.signal });
      if (!res.ok) throw new HttpError(res.status);
      return (await res.json()) as { elements?: unknown[] };
    } catch (err) {
      throw ctrl.signal.aborted ? new HttpError(504) : err;
    } finally {
      clearTimeout(timer);
    }
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function openCache(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Loads OSM places per tile and category, from memory, the local cache, or Overpass. */
export class OverpassLoader {
  #memory = new Map<string, OsmPlace[]>();
  #pending = new Map<Tile, Set<string>>();
  #running = false;
  #lastStart = 0;
  #failures = 0;
  #db: Promise<IDBDatabase | null>;
  #state = writable<LoaderState>({ queued: 0, busyUntil: 0, error: null });
  readonly state: Readable<LoaderState> = { subscribe: this.#state.subscribe };

  constructor(
    private categories: OsmCategory[],
    private onLoaded: () => void,
    private transport: Transport = http,
    db?: Promise<IDBDatabase | null>,
  ) {
    this.#db = db ?? openCache();
  }

  /** All places loaded so far for these categories. */
  places(categoryIds: Set<string>): OsmPlace[] {
    const seen = new Set<string>();
    const out: OsmPlace[] = [];
    for (const [key, places] of this.#memory) {
      if (!categoryIds.has(key.split('|')[1]!)) continue;
      for (const p of places) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        out.push(p);
      }
    }
    return out;
  }

  /** Makes sure these tiles are loaded for these categories. Resolves when they are queued. */
  async ensure(tiles: Tile[], categoryIds: string[]): Promise<void> {
    const db = await this.#db;
    for (const tile of tiles) {
      for (const cat of categoryIds) {
        const key = `${tile}|${cat}`;
        if (this.#memory.has(key) || this.#pending.get(tile)?.has(cat)) continue;
        const cached = db ? await get(db, key) : undefined;
        if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
          this.#memory.set(key, cached.places);
          continue;
        }
        let set = this.#pending.get(tile);
        if (!set) this.#pending.set(tile, (set = new Set()));
        set.add(cat);
      }
    }
    this.#publish();
    this.onLoaded();
    void this.#pump();
  }

  /** Drops queued tiles that are no longer wanted (e.g. after panning away). */
  keepOnly(tiles: Set<Tile>): void {
    for (const tile of [...this.#pending.keys()]) if (!tiles.has(tile)) this.#pending.delete(tile);
    this.#publish();
  }

  async #pump(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#pending.size) {
        const [tile, cats] = this.#pending.entries().next().value as [Tile, Set<string>];
        const wait = Math.max(this.#lastStart + MIN_GAP_MS, this.#busyUntil()) - Date.now();
        if (wait > 0) await this.transport.sleep(wait);
        if (!this.#pending.has(tile)) continue;
        this.#pending.delete(tile);
        const categories = this.categories.filter((c) => cats.has(c.id));
        this.#lastStart = Date.now();
        try {
          const json = await this.transport.query(buildQuery(tile, categories));
          const places = parseElements(json as Parameters<typeof parseElements>[0], categories);
          const db = await this.#db;
          for (const c of categories) {
            const entry: CacheEntry = { key: `${tile}|${c.id}`, fetchedAt: Date.now(), places: places.filter((p) => p.category === c.id) };
            this.#memory.set(entry.key, entry.places);
            if (db) void put(db, entry);
          }
          this.#failures = 0;
          this.#state.update((s) => ({ ...s, busyUntil: 0, error: null }));
          this.onLoaded();
        } catch (err) {
          // Busy or failed: put the tile back and slow down.
          const status = err instanceof HttpError ? err.status : 0;
          this.#pending.set(tile, new Set([...(this.#pending.get(tile) ?? []), ...cats]));
          const pause = Math.min(MAX_BACKOFF_MS, BACKOFF_MS * 2 ** this.#failures++);
          const busy = status === 429 || status >= 502;
          this.#state.update((s) => ({ ...s, busyUntil: Date.now() + pause, error: busy ? 'busy' : 'failed' }));
        }
        this.#publish();
      }
    } finally {
      this.#running = false;
    }
  }

  #busyUntil(): number {
    let v = 0;
    this.#state.update((s) => ((v = s.busyUntil), s));
    return v;
  }

  #publish(): void {
    this.#state.update((s) => ({ ...s, queued: this.#pending.size }));
  }
}

function get(db: IDBDatabase, key: string): Promise<CacheEntry | undefined> {
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
    req.onerror = () => resolve(undefined);
  });
}

function put(db: IDBDatabase, entry: CacheEntry): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
