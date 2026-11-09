import type { Entity, EntityOf, EntityType } from '../model/types';

export type ChangeOrigin = 'local' | 'remote' | 'load';

export interface StoreChange {
  ids: string[];
  origin: ChangeOrigin;
}

type ChangeListener = (change: StoreChange) => void;

/**
 * In-memory entity store for the current trip. Holds every entity including soft-deleted
 * ones (needed for undo and sync); the read helpers hide deleted entities.
 *
 * Implements the Svelte store contract: `$store` yields a version number that bumps on
 * every change, so components can derive from it.
 */
export class TripStore {
  #entities = new Map<string, Entity>();
  #listeners = new Set<ChangeListener>();
  #subscribers = new Set<(version: number) => void>();
  #version = 0;

  get<T extends EntityType>(id: string, type?: T): EntityOf<T> | undefined {
    const e = this.#entities.get(id);
    if (!e || e.deleted || (type && e.type !== type)) return undefined;
    return e as EntityOf<T>;
  }

  /** Includes soft-deleted entities. */
  getRaw(id: string): Entity | undefined {
    return this.#entities.get(id);
  }

  list<T extends EntityType>(type: T, filter?: (e: EntityOf<T>) => boolean): EntityOf<T>[] {
    const out: EntityOf<T>[] = [];
    for (const e of this.#entities.values()) {
      if (e.deleted || e.type !== type) continue;
      if (!filter || filter(e as EntityOf<T>)) out.push(e as EntityOf<T>);
    }
    return out;
  }

  get size(): number {
    return this.#entities.size;
  }

  apply(entities: Entity[], origin: ChangeOrigin): void {
    if (entities.length === 0) return;
    for (const e of entities) this.#entities.set(e.id, e);
    this.#emit({ ids: entities.map((e) => e.id), origin });
  }

  clear(): void {
    const ids = [...this.#entities.keys()];
    this.#entities.clear();
    this.#emit({ ids, origin: 'load' });
  }

  onChange(fn: ChangeListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  subscribe(run: (version: number) => void): () => void {
    this.#subscribers.add(run);
    run(this.#version);
    return () => this.#subscribers.delete(run);
  }

  #emit(change: StoreChange): void {
    this.#version++;
    for (const fn of this.#listeners) fn(change);
    for (const run of this.#subscribers) run(this.#version);
  }
}
