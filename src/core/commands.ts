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

  constructor(
    private store: TripStore,
    private userId: () => string,
    private limit = 300,
  ) {}

  run(cmd: Command): void {
    if (cmd.changes.length === 0) return;
    this.#write(cmd.changes.map((c) => c.after));
    const top = this.#undo.at(-1);
    if (cmd.mergeKey && top?.mergeKey === cmd.mergeKey && this.#redo.length === 0) {
      for (const change of cmd.changes) {
        const existing = top.changes.find((c) => c.id === change.id);
        if (existing) existing.after = change.after;
        else top.changes.push({ ...change });
      }
    } else {
      this.#undo.push({ ...cmd, changes: cmd.changes.map((c) => ({ ...c })) });
      if (this.#undo.length > this.limit) this.#undo.shift();
    }
    this.#redo = [];
    this.#publish();
  }

  undo(): Command | undefined {
    const cmd = this.#undo.pop();
    if (!cmd) return undefined;
    this.#write(cmd.changes.map((c) => c.before ?? { ...c.after, deleted: true }).reverse());
    this.#redo.push(cmd);
    this.#publish();
    return cmd;
  }

  redo(): Command | undefined {
    const cmd = this.#redo.pop();
    if (!cmd) return undefined;
    this.#write(cmd.changes.map((c) => c.after));
    this.#undo.push(cmd);
    this.#publish();
    return cmd;
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

  #write(entities: Entity[]): void {
    const now = Date.now();
    const by = this.userId();
    this.store.apply(
      entities.map((e) => ({ ...e, updatedAt: now, updatedBy: by })),
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
