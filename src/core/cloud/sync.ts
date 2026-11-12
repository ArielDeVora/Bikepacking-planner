import { editedAt, editedBy } from '../../model/edited';
import type { Entity } from '../../model/types';
import type { TripStore } from '../store';
import { entityToRow, rowToEntity, sameContent, type OutRow, type Row } from './rows';

export interface SyncApi {
  /** Rows of the trip changed at or after `since` (all rows when null), oldest first. */
  pull(tripId: string, since: string | null): Promise<Row[]>;
  fetch(ids: string[]): Promise<Row[]>;
  /** Upserts rows and returns them as stored. */
  push(rows: OutRow[]): Promise<Row[]>;
}

export class SyncError extends Error {
  constructor(
    readonly kind: 'offline' | 'denied' | 'server',
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'denied';

/**
 * `overwritten`: someone else's change replaced an edit you made recently.
 * `overwrote`: your unsent edit will replace a change someone else just made.
 */
export interface Conflict {
  kind: 'overwritten' | 'overwrote';
  id: string;
  mine: Entity;
  theirs: Entity;
}

export interface KeyValue<T> {
  load(): T;
  save(value: T): void;
}

export interface SyncOptions {
  tripId: string;
  /** Whether a user id is the current user (their account or their pre-sign-in local id). */
  isMine: (userId: string) => boolean;
  outbox: KeyValue<string[]>;
  cursor: KeyValue<string | null>;
  onConflict: (c: Conflict) => void;
  onStatus: (s: SyncStatus, err?: unknown) => void;
  debounceMs?: number;
  /** Edits younger than this count as "recent" for conflict notices. */
  recentMs?: number;
  /** Retry delays after a failure; the last one repeats. */
  backoffMs?: number[];
  now?: () => number;
}

const MAX_BATCH_BYTES = 800_000;
const MAX_BATCH_ROWS = 200;

/**
 * Keeps one trip in the store in sync with the server. Local edits go into a persisted outbox
 * and are upserted in batches; remote rows (from a pull or from realtime) are applied unless
 * the entity has a local edit still waiting to be sent. Last write to reach the server wins;
 * the conflict callback reports every case where that drops someone's change.
 */
export class SyncEngine {
  #outbox: Set<string>;
  #inflight = new Map<string, Entity>();
  #flushTimer: ReturnType<typeof setTimeout> | undefined;
  #pullTimer: ReturnType<typeof setTimeout> | undefined;
  #flushing = false;
  #again = false;
  #failures = 0;
  #stopped = false;
  #status: SyncStatus | null = null;
  readonly #o: Required<SyncOptions>;

  constructor(
    private store: TripStore,
    private api: SyncApi,
    opts: SyncOptions,
  ) {
    this.#o = {
      debounceMs: 300,
      recentMs: 60 * 60 * 1000,
      backoffMs: [2_000, 5_000, 15_000, 30_000, 60_000],
      now: Date.now,
      ...opts,
    };
    this.#outbox = new Set(opts.outbox.load());
  }

  get pending(): number {
    return this.#outbox.size;
  }

  /** Pulls everything changed since the last sync, then sends the outbox. */
  async start(): Promise<void> {
    await this.pull();
    await this.flush();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#flushTimer);
    clearTimeout(this.#pullTimer);
  }

  async pull(): Promise<void> {
    clearTimeout(this.#pullTimer);
    if (this.#stopped) return;
    try {
      this.#setStatus('syncing');
      this.applyRows(await this.api.pull(this.#o.tripId, this.#o.cursor.load()));
      this.#failures = 0;
      if (!this.#outbox.size) this.#setStatus('synced');
    } catch (err) {
      this.#fail(err, 'pull');
    }
  }

  /** Queues locally changed entities for upload. */
  localChanged(ids: string[]): void {
    let added = false;
    for (const id of ids) {
      if (this.store.getRaw(id)?.tripId !== this.#o.tripId) continue;
      this.#outbox.add(id);
      added = true;
    }
    if (!added) return;
    this.#o.outbox.save([...this.#outbox]);
    this.#schedule(this.#o.debounceMs);
  }

  /** A row from realtime. Large rows arrive without `data` and are fetched separately. */
  async receive(row: Partial<Row> & { id: string }): Promise<void> {
    if (row.data && row.updated_at && row.trip_id) {
      this.applyRows([row as Row]);
      return;
    }
    try {
      this.applyRows(await this.api.fetch([row.id]));
    } catch (err) {
      this.#fail(err, 'pull');
    }
  }

  applyRows(rows: Row[]): void {
    const cursor = this.#o.cursor.load();
    let next = cursor;
    const apply: Entity[] = [];
    for (const row of rows) {
      if (!next || row.updated_at > next) next = row.updated_at;
      if (row.trip_id !== this.#o.tripId) continue;
      const theirs = rowToEntity(row);
      const local = this.store.getRaw(row.id);

      if (this.#outbox.has(row.id) || this.#inflight.has(row.id)) {
        // Not when theirs only fills in my own edit (routing, elevation): mine replaces it anyway.
        if (local && !this.#o.isMine(editedBy(theirs)) && !sameContent(local, theirs)) {
          this.#o.onConflict({ kind: 'overwrote', id: row.id, mine: local, theirs });
        }
        continue;
      }
      if (local && sameContent(local, theirs)) {
        if (local.updatedAt !== theirs.updatedAt || local.updatedBy !== theirs.updatedBy) apply.push(theirs);
        continue;
      }
      // Someone else's edit, or an app filling in an older version of mine (which drops my newer one).
      // Not someone's app filling in the version I have: my edit is still there.
      if (
        local &&
        this.#o.isMine(editedBy(local)) &&
        (!this.#o.isMine(editedBy(theirs)) || editedAt(theirs) < editedAt(local)) &&
        this.#o.now() - editedAt(local) < this.#o.recentMs
      ) {
        this.#o.onConflict({ kind: 'overwritten', id: row.id, mine: local, theirs });
      }
      apply.push(theirs);
    }
    this.store.apply(apply, 'remote');
    if (next && next !== cursor) this.#o.cursor.save(next);
  }

  /** Sends the outbox now. */
  async flush(): Promise<void> {
    clearTimeout(this.#flushTimer);
    if (this.#stopped) return;
    if (this.#flushing) {
      this.#again = true;
      return;
    }
    if (!this.#outbox.size) return;
    this.#flushing = true;
    this.#setStatus('syncing');
    try {
      for (const batch of this.#batches()) {
        for (const [id, e] of batch) this.#inflight.set(id, e);
        const stored = await this.api.push([...batch.values()].map(entityToRow));
        const stamped: Entity[] = [];
        for (const [id, sent] of batch) {
          this.#inflight.delete(id);
          if (this.store.getRaw(id) === sent) this.#outbox.delete(id);
        }
        for (const row of stored) {
          const local = this.store.getRaw(row.id);
          if (local && local === batch.get(row.id)) {
            stamped.push({ ...local, updatedAt: Date.parse(row.updated_at), updatedBy: row.updated_by ?? local.updatedBy });
          }
        }
        this.store.apply(stamped, 'remote');
        this.#o.outbox.save([...this.#outbox]);
      }
      this.#failures = 0;
      this.#setStatus(this.#outbox.size ? 'syncing' : 'synced');
    } catch (err) {
      this.#inflight.clear();
      this.#fail(err, 'flush');
    } finally {
      this.#flushing = false;
    }
    if (this.#again) {
      this.#again = false;
      await this.flush();
    }
  }

  *#batches(): Generator<Map<string, Entity>> {
    let batch = new Map<string, Entity>();
    let bytes = 0;
    for (const id of this.#outbox) {
      const e = this.store.getRaw(id);
      if (!e) {
        this.#outbox.delete(id);
        continue;
      }
      const size = JSON.stringify(e).length;
      if (batch.size && (bytes + size > MAX_BATCH_BYTES || batch.size >= MAX_BATCH_ROWS)) {
        yield batch;
        batch = new Map();
        bytes = 0;
      }
      batch.set(id, e);
      bytes += size;
    }
    if (batch.size) yield batch;
  }

  #schedule(ms: number): void {
    if (this.#stopped) return;
    clearTimeout(this.#flushTimer);
    this.#flushTimer = setTimeout(() => void this.flush(), ms);
  }

  #fail(err: unknown, retry: 'pull' | 'flush'): void {
    const kind = err instanceof SyncError ? err.kind : 'offline';
    this.#setStatus(kind === 'denied' ? 'denied' : 'offline', err);
    if (kind === 'denied' || this.#stopped) return;
    const delays = this.#o.backoffMs;
    const delay = delays[Math.min(this.#failures, delays.length - 1)]!;
    this.#failures++;
    if (retry === 'pull') {
      clearTimeout(this.#pullTimer);
      this.#pullTimer = setTimeout(() => void this.pull(), delay);
    } else {
      this.#schedule(delay);
    }
  }

  #setStatus(s: SyncStatus, err?: unknown): void {
    if (s === this.#status && !err) return;
    this.#status = s;
    this.#o.onStatus(s, err);
  }
}
