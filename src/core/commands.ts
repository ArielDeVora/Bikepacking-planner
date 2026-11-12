import { editedAt, editedBy } from '../model/edited';
import { writable, type Readable } from 'svelte/store';
import type { Draft, Entity } from '../model/types';
import type { TripStore } from './store';

/** One entity transition. `before === null` means the command created the entity. */
export interface Change {
  id: string;
  before: Entity | null;
  after: Entity;
}

export interface Command {
  label: string;
  changes: Change[];
  /** Consecutive commands with the same key collapse into one undo step (drags, typing). */
  mergeKey?: string;
}

/** What happened to the trip: a command was run (possibly merged into the previous one), undone or redone. */
export type CommitListener = (cmd: Command, kind: 'edit' | 'undo' | 'redo', merged: boolean) => void;

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export class CommandStack {
  #undo: Command[] = [];
  #redo: Command[] = [];
  #state = writable<HistoryState>({ canUndo: false, canRedo: false });
  readonly state: Readable<HistoryState> = { subscribe: this.#state.subscribe };

  /**
   * Called with the current version of the entities an undo or redo is about to overwrite.
   * Returning false cancels it (e.g. after asking before overwriting someone else's edit).
   */
  guard: ((current: Entity[]) => boolean) | null = null;

  /** When set, nothing can be changed: commands, undo and redo call it instead. */
  locked: (() => void) | null = null;

  #listeners = new Set<CommitListener>();

  /** Called after every command, undo and redo (not for patches). */
  onCommit(fn: CommitListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit(cmd: Command, kind: 'edit' | 'undo' | 'redo', merged: boolean): void {
    for (const fn of this.#listeners) fn(cmd, kind, merged);
  }

  constructor(
    private store: TripStore,
    private userId: () => string,
    private limit = 300,
  ) {}

  run(cmd: Command): void {
    if (cmd.changes.length === 0) return;
    if (this.locked) return this.locked();
    this.#write(cmd.changes.map((c) => c.after), true);
    const top = this.#undo.at(-1);
    const merged = !!cmd.mergeKey && top?.mergeKey === cmd.mergeKey && this.#redo.length === 0;
    if (merged) {
      for (const change of cmd.changes) {
        const existing = top!.changes.find((c) => c.id === change.id);
        if (existing) existing.after = change.after;
        else top!.changes.push({ ...change });
      }
    } else {
      this.#undo.push({ ...cmd, changes: cmd.changes.map((c) => ({ ...c })) });
      if (this.#undo.length > this.limit) this.#undo.shift();
    }
    this.#redo = [];
    this.#publish();
    this.#emit(cmd, 'edit', merged);
  }

  undo(): Command | undefined {
    if (this.locked) return void this.locked();
    const cmd = this.#undo.at(-1);
    if (!cmd || !this.#allowed(cmd)) return undefined;
    this.#undo.pop();
    const back = cmd.changes.map((c) => ({ id: c.id, before: c.after, after: c.before ?? { ...c.after, deleted: true } })).reverse();
    this.#write(back.map((c) => c.after), true);
    this.#redo.push(cmd);
    this.#publish();
    this.#emit({ label: cmd.label, changes: back }, 'undo', false);
    return cmd;
  }

  redo(): Command | undefined {
    if (this.locked) return void this.locked();
    const cmd = this.#redo.at(-1);
    if (!cmd || !this.#allowed(cmd)) return undefined;
    this.#redo.pop();
    this.#write(cmd.changes.map((c) => c.after), true);
    this.#undo.push(cmd);
    this.#publish();
    this.#emit(cmd, 'redo', false);
    return cmd;
  }

  /**
   * Writes changes without recording an undo step. Only for data derived from an earlier
   * command (e.g. routed geometry for a pending leg), which is derived again if an undo or redo
   * brings back the old value.
   */
  patch(changes: Change[]): void {
    if (changes.length && !this.locked) this.#write(changes.map((c) => c.after), false);
  }

  /** Ends any pending merge so the next command starts a new undo step. */
  seal(): void {
    const top = this.#undo.at(-1);
    if (top) top.mergeKey = undefined;
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
    this.#publish();
  }

  #allowed(cmd: Command): boolean {
    if (!this.guard) return true;
    const current = cmd.changes.map((c) => this.store.getRaw(c.id)).filter((e): e is Entity => !!e);
    return this.guard(current);
  }

  /** Saves entities; `byHand` also makes the current user their editor (patches keep the previous one). */
  #write(entities: Entity[], byHand: boolean): void {
    const now = Date.now();
    const by = this.userId();
    this.store.apply(
      entities.map((e) => {
        if (byHand) return { ...e, updatedAt: now, updatedBy: by, editedAt: now, editedBy: by };
        const previous = this.store.getRaw(e.id);
        const editor = previous ? { editedAt: editedAt(previous), editedBy: editedBy(previous) } : { editedAt: now, editedBy: by };
        return { ...e, ...editor, updatedAt: now, updatedBy: by };
      }),
      'local',
    );
  }

  #publish(): void {
    const u = this.#undo.at(-1);
    const r = this.#redo.at(-1);
    this.#state.set({
      canUndo: !!u,
      canRedo: !!r,
      undoLabel: u?.label,
      redoLabel: r?.label,
    });
  }
}

/** Builders for the changes that make up a command. */
export const edits = {
  create<E extends Entity>(draft: Draft<E>): Change {
    const after = { ...draft, updatedAt: 0, updatedBy: '', deleted: false } as unknown as Entity;
    return { id: after.id, before: null, after };
  },

  update<E extends Entity>(store: TripStore, id: string, patch: Partial<Omit<E, 'id' | 'type'>>): Change {
    const before = store.getRaw(id);
    if (!before) throw new Error(`update: unknown entity ${id}`);
    return { id, before, after: { ...before, ...patch } as Entity };
  },

  remove(store: TripStore, id: string): Change {
    const before = store.getRaw(id);
    if (!before) throw new Error(`remove: unknown entity ${id}`);
    return { id, before, after: { ...before, deleted: true } };
  },
};
