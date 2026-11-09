import { writable, type Readable } from 'svelte/store';
import type { OsmCategory } from '../../config/pois';
import { cacheGet, cachePut } from '../../lib/cache';
import { OVERPASS_ENDPOINTS as ENDPOINTS, OverpassError, overpassFetch } from '../../lib/overpass';
import { buildQuery, parseElements, type OsmPlace, type Tile } from './overpass';

// Requests go one at a time, at least MIN_GAP_MS apart, and every tile is cached for TTL_MS.
const MIN_GAP_MS = 1500;
const TTL_MS = 14 * 24 * 3600 * 1000;
/** After a failure, wait this long, doubling with each further failure (as the server asks). */
const BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000;


export interface LoaderState {
  queued: number;
  busyUntil: number;
  error: string | null;
}

export interface Transport {
  query(q: string, endpoint: string): Promise<{ elements?: unknown[] }>;
  sleep(ms: number): Promise<void>;
}

const http: Transport = {
  query: overpassFetch,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Loads OSM places per tile and category, from memory, the local cache, or Overpass. */
export class OverpassLoader {
  #memory = new Map<string, OsmPlace[]>();
  #pending = new Map<Tile, Set<string>>();
  #running = false;
  #lastStart = 0;
  #failures = 0;
  #endpoint = 0;
  #state = writable<LoaderState>({ queued: 0, busyUntil: 0, error: null });
  readonly state: Readable<LoaderState> = { subscribe: this.#state.subscribe };

  constructor(
    private categories: OsmCategory[],
    private onLoaded: () => void,
    private transport: Transport = http,
    private cache: { get: typeof cacheGet; put: typeof cachePut } = { get: cacheGet, put: cachePut },
  ) {}

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
    for (const tile of tiles) {
      for (const cat of categoryIds) {
        const key = `${tile}|${cat}`;
        if (this.#memory.has(key) || this.#pending.get(tile)?.has(cat)) continue;
        const cached = await this.cache.get<OsmPlace[]>(key, TTL_MS);
        if (cached) {
          this.#memory.set(key, cached);
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
          const json = await this.transport.query(buildQuery(tile, categories), ENDPOINTS[this.#endpoint]!);
          const places = parseElements(json as Parameters<typeof parseElements>[0], categories);
          for (const c of categories) {
            const key = `${tile}|${c.id}`;
            const own = places.filter((p) => p.category === c.id);
            this.#memory.set(key, own);
            void this.cache.put(key, own);
          }
          this.#failures = 0;
          this.#state.update((s) => ({ ...s, busyUntil: 0, error: null }));
          this.onLoaded();
        } catch (err) {
          // Busy or failed: put the tile back and slow down.
          const busyError = err instanceof OverpassError && err.busy;
          this.#pending.set(tile, new Set([...(this.#pending.get(tile) ?? []), ...cats]));
          // Try the next server straight away; once all have failed in a row, back off.
          this.#endpoint = (this.#endpoint + 1) % ENDPOINTS.length;
          const rounds = Math.floor(++this.#failures / ENDPOINTS.length);
          const pause = this.#failures % ENDPOINTS.length ? 0 : Math.min(MAX_BACKOFF_MS, BACKOFF_MS * 2 ** (rounds - 1));
          const busy = busyError;
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
