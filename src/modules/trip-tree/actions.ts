import { STAGE_COLORS } from '../../config/modes';
import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { sortedStages } from '../../lib/tree';
import { keyBetween } from '../../model/order';
import type { Stage } from '../../model/types';

export { sortedStages };

export function addStage(store: TripStore, tripId: string, name: string, label: string): Command {
  const stages = sortedStages(store);
  return {
    label,
    changes: [
      edits.create<Stage>({
        id: newId(),
        type: 'stage',
        tripId,
        order: keyBetween(stages.at(-1)?.order ?? null, null),
        name,
        notes: '',
        color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
      }),
    ],
  };
}

/** Moves stages, in this order, before `beforeId` (or to the end when null). */
export function moveStagesCommand(store: TripStore, ids: string[], beforeId: string | null, label: string): Command | null {
  const moving = new Set(ids);
  const others = sortedStages(store).filter((s) => !moving.has(s.id));
  const at = beforeId ? others.findIndex((s) => s.id === beforeId) : others.length;
  const index = at < 0 ? others.length : at;
  let prev = others[index - 1]?.order ?? null;
  const next = others[index]?.order ?? null;
  const changes = ids.flatMap((id) => {
    if (!store.get(id, 'stage')) return [];
    const order = keyBetween(prev, next);
    prev = order;
    return [edits.update<Stage>(store, id, { order })];
  });
  return changes.length ? { label, changes } : null;
}

/** Soft-deletes a stage and everything in it. */
export function deleteStage(store: TripStore, id: string, label: string): Command {
  const segments = store.list('segment', (s) => s.stageId === id);
  const groups = store.list('group', (g) => g.stageId === id);
  return {
    label,
    changes: [...segments.map((s) => edits.remove(store, s.id)), ...groups.map((g) => edits.remove(store, g.id)), edits.remove(store, id)],
  };
}
