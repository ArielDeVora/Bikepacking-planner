import { get, writable, type Readable } from 'svelte/store';
import type { EventBus, Events } from './bus';

export class Selection {
  #ids = writable<string[]>([]);
  readonly ids: Readable<string[]> = { subscribe: this.#ids.subscribe };

  constructor(private bus: EventBus<Events>) {}

  get current(): string[] {
    return get(this.#ids);
  }

  set(ids: string[]): void {
    const prev = this.current;
    if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return;
    this.#ids.set(ids);
    this.bus.emit('selection:changed', { ids });
  }

  clear(): void {
    this.set([]);
  }
}
