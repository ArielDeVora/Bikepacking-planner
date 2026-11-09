import { get, writable, type Readable } from 'svelte/store';
import type { Settings } from './settings';

/**
 * Stages, groups and segments hidden from the map. A viewing preference, kept per trip in this browser
 * (not synced): each person can hide what they don't need to see.
 */
export class Visibility {
  #hidden = writable<ReadonlySet<string>>(new Set());
  readonly hidden: Readable<ReadonlySet<string>> = { subscribe: this.#hidden.subscribe };

  constructor(
    private settings: Settings,
    private tripId: () => string,
  ) {}

  /** Reads the saved state for the open trip. */
  load(): void {
    this.#hidden.set(new Set(this.settings.get<string[]>(this.#key(), [])));
  }

  isHidden(id: string): boolean {
    return get(this.#hidden).has(id);
  }

  /** Whether a segment is hidden, by itself or through its stage or group. */
  segmentHidden(seg: { id: string; stageId: string; groupId?: string }): boolean {
    const hidden = get(this.#hidden);
    return hidden.has(seg.id) || hidden.has(seg.stageId) || (!!seg.groupId && hidden.has(seg.groupId));
  }

  toggle(id: string): void {
    this.set([id], !this.isHidden(id));
  }

  set(ids: string[], hidden: boolean): void {
    const next = new Set(get(this.#hidden));
    for (const id of ids) {
      if (hidden) next.add(id);
      else next.delete(id);
    }
    this.#hidden.set(next);
    this.settings.set(this.#key(), [...next]);
  }

  showAll(): void {
    this.#hidden.set(new Set());
    this.settings.set(this.#key(), []);
  }

  #key(): string {
    return `hidden:${this.tripId()}`;
  }
}
