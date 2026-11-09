import { writable, type Readable } from 'svelte/store';
import type { Coord } from '../../../lib/geo/polyline';
import { RoutingError, type RouteRequest, type RoutingProvider } from './provider';

export class RoutingCancelled extends Error {
  constructor() {
    super('Routing request no longer needed');
    this.name = 'RoutingCancelled';
  }
}

export interface QueueOptions {
  cacheSize?: number;
  /** Minimum time between the start of two requests. */
  minGapMs?: number;
  timeoutMs?: number;
  /** How long to stop sending requests after the service says it is overloaded. */
  rateLimitPauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Entry {
  req: RouteRequest;
  waiters: (() => boolean)[];
  resolve: (coords: Coord[]) => void;
  reject: (err: unknown) => void;
  promise: Promise<Coord[]>;
}

const fmt = ([lng, lat]: readonly number[]) => `${lng!.toFixed(6)},${lat!.toFixed(6)}`;

/**
 * Sends routing requests one at a time, with a gap between them, and caches the results.
 * Identical requests share one call. Before a request is sent, it is dropped if none of its
 * callers still needs it.
 */
export class RoutingQueue {
  #cache = new Map<string, Coord[]>();
  #entries = new Map<string, Entry>();
  #order: string[] = [];
  #running = false;
  #lastStart = -Infinity;
  #pausedUntil = 0;
  #size = writable(0);
  /** Number of requests waiting or in flight. */
  readonly size: Readable<number> = { subscribe: this.#size.subscribe };

  readonly #opts: Required<QueueOptions>;

  constructor(
    readonly provider: RoutingProvider,
    opts: QueueOptions = {},
  ) {
    this.#opts = {
      cacheSize: 1000,
      minGapMs: 250,
      timeoutMs: 45_000,
      rateLimitPauseMs: 15_000,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...opts,
    };
  }

  key(req: RouteRequest): string {
    const nogos = req.nogos.map((ring) => ring.map(fmt).join(';')).join('|');
    return `${this.provider.id}|${req.profile}|${fmt(req.from)}|${fmt(req.to)}|${nogos}`;
  }

  cached(req: RouteRequest): Coord[] | undefined {
    return this.#cache.get(this.key(req));
  }

  request(req: RouteRequest, stillNeeded: () => boolean = () => true): Promise<Coord[]> {
    const key = this.key(req);
    const hit = this.#cache.get(key);
    if (hit) {
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return Promise.resolve(hit);
    }
    let entry = this.#entries.get(key);
    if (!entry) {
      let resolve!: Entry['resolve'];
      let reject!: Entry['reject'];
      const promise = new Promise<Coord[]>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      entry = { req, waiters: [], resolve, reject, promise };
      this.#entries.set(key, entry);
      this.#order.push(key);
      this.#size.set(this.#entries.size);
    }
    entry.waiters.push(stillNeeded);
    void this.#pump();
    return entry.promise;
  }

  async #pump(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#order.length) {
        const key = this.#order.shift()!;
        const entry = this.#entries.get(key)!;
        if (!entry.waiters.some((needed) => needed())) {
          this.#finish(key);
          entry.reject(new RoutingCancelled());
          continue;
        }
        const wait = Math.max(this.#pausedUntil, this.#lastStart + this.#opts.minGapMs) - Date.now();
        if (wait > 0) await this.#opts.sleep(wait);
        this.#lastStart = Date.now();

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.#opts.timeoutMs);
        try {
          const coords = await this.provider.route(entry.req, ctrl.signal);
          this.#remember(key, coords);
          entry.resolve(coords);
        } catch (err) {
          if (err instanceof RoutingError && err.kind === 'rateLimit') {
            this.#pausedUntil = Date.now() + this.#opts.rateLimitPauseMs;
          }
          entry.reject(err);
        } finally {
          clearTimeout(timer);
          this.#finish(key);
        }
      }
    } finally {
      this.#running = false;
    }
  }

  #finish(key: string): void {
    this.#entries.delete(key);
    this.#size.set(this.#entries.size);
  }

  #remember(key: string, coords: Coord[]): void {
    this.#cache.set(key, coords);
    if (this.#cache.size > this.#opts.cacheSize) this.#cache.delete(this.#cache.keys().next().value!);
  }
}
