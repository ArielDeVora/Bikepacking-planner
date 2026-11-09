import { STAGE_COLORS } from '../../config/modes';
import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { inGroup, siblingsOf, sortedStages, stageChildren, type StageChild } from '../../lib/tree';
import { keyBetween } from '../../model/order';
import type { Group, Segment, Stage } from '../../model/types';

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

/** Moves an item one position up (-1) or down (+1) among its ordered siblings. Null at either end. */
function moveAmong(store: TripStore, list: (Stage | StageChild)[], id: string, dir: -1 | 1, label: string): Command | null {
  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const [lo, hi] = dir < 0 ? [list[j - 1], list[j]] : [list[j], list[j + 1]];
  const order = keyBetween(lo?.order ?? null, hi?.order ?? null);
  return { label, changes: [edits.update<Stage | Group | Segment>(store, id, { order })] };
}

export const moveStage = (store: TripStore, id: string, dir: -1 | 1, label: string) =>
  moveAmong(store, sortedStages(store), id, dir, label);

/** Moves a group one position up or down among its stage's children. */
export function moveGroup(store: TripStore, id: string, dir: -1 | 1, label: string): Command | null {
  const group = store.get(id, 'group');
  return group ? moveAmong(store, stageChildren(store, group.stageId), id, dir, label) : null;
}

/**
 * Moves a segment one position up or down. From the first or last place of a group it leaves the
 * group (just before or after it); from the first or last place of its stage it moves to the end
 * of the previous stage, or the start of the next one. Null when there is nowhere to go.
 */
export function moveSegment(store: TripStore, id: string, dir: -1 | 1, label: string): Command | null {
  const seg = store.get(id, 'segment');
  if (!seg) return null;
  const within = moveAmong(store, siblingsOf(store, seg), id, dir, label);
  if (within) return within;
  if (inGroup(store, seg)) {
    const children = stageChildren(store, seg.stageId);
    const i = children.findIndex((c) => c.id === seg.groupId);
    const [lo, hi] = dir < 0 ? [children[i - 1], children[i]] : [children[i], children[i + 1]];
    const order = keyBetween(lo?.order ?? null, hi?.order ?? null);
    return { label, changes: [edits.update<Segment>(store, id, { groupId: undefined, order })] };
  }
  const stages = sortedStages(store);
  const target = stages[stages.findIndex((s) => s.id === seg.stageId) + dir];
  if (!target) return null;
  const list = stageChildren(store, target.id);
  const order = dir < 0 ? keyBetween(list.at(-1)?.order ?? null, null) : keyBetween(null, list[0]?.order ?? null);
  return { label, changes: [edits.update<Segment>(store, id, { stageId: target.id, groupId: undefined, order })] };
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
