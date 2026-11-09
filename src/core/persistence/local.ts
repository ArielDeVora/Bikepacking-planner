import type { Entity } from '../../model/types';
import type { TripStore } from '../store';

export interface EntityWriter {
  write(entities: Entity[]): Promise<void>;
}

/**
 * Batches store changes and writes them after `delayMs` of quiet, and immediately when the
 * page is hidden. Changes that came from loading are not written back.
 */
export function attachDebouncedSave(
  store: TripStore,
  writer: EntityWriter,
  onError: (err: unknown) => void,
  delayMs = 400,
): { flush: () => Promise<void>; detach: () => void } {
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (dirty.size === 0) return;
    const entities = [...dirty].map((id) => store.getRaw(id)).filter((e): e is Entity => !!e);
    dirty.clear();
    try {
      await writer.write(entities);
    } catch (err) {
      for (const e of entities) dirty.add(e.id);
      onError(err);
    }
  };

  const off = store.onChange(({ ids, origin }) => {
    if (origin === 'load') return;
    for (const id of ids) dirty.add(id);
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);

  return {
    flush,
    detach() {
      off();
      clearTimeout(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    },
  };
}
