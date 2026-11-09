/**
 * Typed event map. Modules add their own events through declaration merging:
 *
 *   declare module '../../core/bus' {
 *     interface Events { 'routing:failed': { segmentId: string } }
 *   }
 */
export interface Events {
  'selection:changed': { ids: string[] };
  'trip:loaded': { tripId: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = Events> {
  #handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    let set = this.#handlers.get(event);
    if (!set) this.#handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.#handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`Handler for "${String(event)}" failed`, err);
      }
    }
  }
}
