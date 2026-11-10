import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';

/** Soft-deletes a stage and everything in it. */
export function deleteStage(store: TripStore, id: string, label: string): Command {
  const segments = store.list('segment', (s) => s.stageId === id);
  const groups = store.list('group', (g) => g.stageId === id);
  return {
    label,
    changes: [...segments.map((s) => edits.remove(store, s.id)), ...groups.map((g) => edits.remove(store, g.id)), edits.remove(store, id)],
  };
}
