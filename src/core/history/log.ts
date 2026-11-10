import { writable, type Readable } from 'svelte/store';
import { listCommits, putCommits, type StoredCommit } from '../persistence/idb';
import type { Commit } from './diff';

/** The server side of the history, for shared trips. */
export interface RemoteHistory {
  insert(commits: Commit[]): Promise<void>;
  /** Commits older than `before` (all when null), newest first. */
  list(tripId: string, before: number | null, limit: number): Promise<Commit[]>;
  /** Deletes the trip's commits older than `keepDays` (owners only); returns how many. */
  prune(tripId: string, keepDays: number): Promise<number>;
}

/** Thrown by a RemoteHistory when the server has no history table yet. */
export class HistoryMissing extends Error {}

/**
 * `local`: this browser's commits only (the trip isn't shared). `shared`: everyone's, from the
 * server. `missing`: shared, but the server has no history table yet, so this browser's only.
 */
export type HistoryScope = 'local' | 'shared' | 'missing';

/**
 * Where commits are kept: always in this browser, and on the server for shared trips (sent in
 * the background, again later if offline).
 */
export class HistoryLog {
  #scope = writable<HistoryScope>('local');
  readonly scope: Readable<HistoryScope> = { subscribe: this.#scope.subscribe };
  #changed = writable(0);
  /** Bumped when commits are added. */
  readonly changed: Readable<number> = { subscribe: this.#changed.subscribe };
  #uploading = false;

  constructor(
    private db: () => IDBDatabase | null,
    private remote: () => RemoteHistory | null,
    private tripId: () => string,
  ) {}

  async add(commit: Commit): Promise<void> {
    const db = this.db();
    if (db) await putCommits(db, [{ ...commit, synced: false }]).catch((err) => console.warn(err));
    this.#changed.update((n) => n + 1);
    void this.upload();
  }

  /** Sends this browser's commits the server doesn't have yet. */
  async upload(): Promise<void> {
    const db = this.db();
    const remote = this.remote();
    if (!db || !remote || this.#uploading) return;
    this.#uploading = true;
    try {
      const pending = (await listCommits(db, this.tripId())).filter((c) => !c.synced).reverse();
      for (let i = 0; i < pending.length; i += 50) {
        const batch = pending.slice(i, i + 50);
        await remote.insert(batch.map(({ synced: _s, ...c }) => c));
        await putCommits(db, batch.map((c) => ({ ...c, synced: true })));
      }
      this.#scope.set('shared');
    } catch (err) {
      if (err instanceof HistoryMissing) this.#scope.set('missing');
      else console.warn(err);
    } finally {
      this.#uploading = false;
    }
  }

  /** Deletes the shared history older than `keepDays` on the server. */
  async prune(keepDays: number): Promise<number> {
    const remote = this.remote();
    if (!remote) return 0;
    const n = await remote.prune(this.tripId(), keepDays);
    this.#changed.update((v) => v + 1);
    return n;
  }

  /**
   * Commits, newest first: everyone's from the server when the trip is shared (plus this
   * browser's not sent yet), else this browser's.
   */
  async list(before: number | null, limit: number): Promise<Commit[]> {
    const db = this.db();
    const local: StoredCommit[] = db ? await listCommits(db, this.tripId()) : [];
    const strip = ({ synced: _s, ...c }: StoredCommit): Commit => c;
    const remote = this.remote();
    if (remote) {
      try {
        const server = await remote.list(this.tripId(), before, limit);
        this.#scope.set('shared');
        const ids = new Set(server.map((c) => c.id));
        const pending = local.filter((c) => !c.synced && !ids.has(c.id) && (before === null || c.at < before)).map(strip);
        return [...pending, ...server].sort((a, b) => b.at - a.at).slice(0, limit);
      } catch (err) {
        if (err instanceof HistoryMissing) this.#scope.set('missing');
        else throw err;
      }
    } else this.#scope.set('local');
    return local.filter((c) => before === null || c.at < before).slice(0, limit).map(strip);
  }
}
