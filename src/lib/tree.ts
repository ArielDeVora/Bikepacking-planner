import type { TripStore } from '../core/store';
import { compareOrder } from '../model/order';
import type { Group, Segment, Stage } from '../model/types';

/**
 * The order of the trip: stages, then each stage's children (its groups and ungrouped segments,
 * in one order), then each group's segments. Everything that lists segments "in trip order" uses
 * these helpers.
 */

export type StageChild = Group | Segment;

export const sortedStages = (store: TripStore): Stage[] => store.list('stage').sort(compareOrder);

/** Whether the segment sits in an existing group (a segment whose group is gone counts as ungrouped). */
export const inGroup = (store: TripStore, seg: Segment): boolean => !!seg.groupId && !!store.get(seg.groupId, 'group');

/** A stage's groups and ungrouped segments, in order. */
export function stageChildren(store: TripStore, stageId: string): StageChild[] {
  const groups = store.list('group', (g) => g.stageId === stageId);
  const loose = store.list('segment', (s) => s.stageId === stageId && !inGroup(store, s));
  return [...groups, ...loose].sort(compareOrder);
}

export const groupSegments = (store: TripStore, groupId: string): Segment[] =>
  store.list('segment', (s) => s.groupId === groupId).sort(compareOrder);

/** All segments of a stage, in display order (groups expanded). */
export function stageSegments(store: TripStore, stageId: string): Segment[] {
  return stageChildren(store, stageId).flatMap((c) => (c.type === 'group' ? groupSegments(store, c.id) : [c]));
}

/** All segments of the trip, in order. */
export function tripSegments(store: TripStore): Segment[] {
  return sortedStages(store).flatMap((st) => stageSegments(store, st.id));
}

/** The segments of a stage or group (or the segment itself). */
export function segmentsOf(store: TripStore, id: string): Segment[] {
  const e = store.get(id);
  if (e?.type === 'stage') return stageSegments(store, id);
  if (e?.type === 'group') return groupSegments(store, id);
  return e?.type === 'segment' ? [e] : [];
}

/** The list a segment is ordered in: its group's segments, or its stage's children. */
export function siblingsOf(store: TripStore, seg: Segment): StageChild[] {
  return inGroup(store, seg) ? groupSegments(store, seg.groupId!) : stageChildren(store, seg.stageId);
}
