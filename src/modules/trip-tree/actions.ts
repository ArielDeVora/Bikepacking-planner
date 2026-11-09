import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { compareOrder, keyBetween } from '../../model/order';
import type { Stage } from '../../model/types';

export const sortedStages = (store: TripStore): Stage[] => store.list('stage').sort(compareOrder);

export function addStage(store: TripStore, tripId: string, name: string, label: string): Command {
  const last = sortedStages(store).at(-1);
  return {
    label,
    changes: [
      edits.create<Stage>({
        id: newId(),
        type: 'stage',
        tripId,
        order: keyBetween(last?.order ?? null, null),
        name,
        notes: '',
      }),
    ],
  };
}

/** Moves a stage one position up (-1) or down (+1). Returns null at either end. */
export function moveStage(store: TripStore, id: string, dir: -1 | 1, label: string): Command | null {
  const stages = sortedStages(store);
  const i = stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= stages.length) return null;
  const [lo, hi] = dir < 0 ? [stages[j - 1], stages[j]] : [stages[j], stages[j + 1]];
  const order = keyBetween(lo?.order ?? null, hi?.order ?? null);
  return { label, changes: [edits.update<Stage>(store, id, { order })] };
}

/** Soft-deletes a stage and everything in it. */
export function deleteStage(store: TripStore, id: string, label: string): Command {
  const segments = store.list('segment', (s) => s.stageId === id);
  return {
    label,
    changes: [...segments.map((s) => edits.remove(store, s.id)), edits.remove(store, id)],
  };
}
