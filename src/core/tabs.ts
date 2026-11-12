import type { TripStore } from './store';

/**
 * Keeps several tabs of the planner on the same trip in step (e.g. the map in one, the planning
 * view in another): each tab passes on its own edits, and takes the others' as if from elsewhere.
 */
export function syncTabs(store: TripStore, tripId: () => string): () => void {
  if (typeof BroadcastChannel !== 'function') return () => {};
  const channel = new BroadcastChannel('bikepacking-planner');
  const off = store.onChange(({ ids, origin }) => {
    if (origin !== 'local') return;
    const entities = ids.map((id) => store.getRaw(id)).filter((e) => !!e);
    if (!entities.length) return;
    try {
      // As JSON, like the server gets them: nothing that can't be copied to another tab.
      channel.postMessage({ tripId: tripId(), entities: JSON.parse(JSON.stringify(entities)) as unknown });
    } catch (err) {
      console.warn('Could not pass the change to other tabs', err);
    }
  });
  channel.onmessage = (e: MessageEvent<{ tripId?: string; entities?: unknown }>) => {
    const { tripId: id, entities } = e.data ?? {};
    if (id && id === tripId() && Array.isArray(entities)) store.apply(entities, 'remote');
  };
  return () => {
    off();
    channel.close();
  };
}
