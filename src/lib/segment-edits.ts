import { MODES } from '../config/modes';
import { edits, type Change, type Command } from '../core/commands';
import type { TripStore } from '../core/store';
import { copyGeometry, editableGeometry, eraseRange, mergeGeometry, reverseGeometry, splitAt } from '../model/edit-ops';
import { newId } from '../model/ids';
import { keyBetween } from '../model/order';
import type { SegmentGeometry } from '../model/segment';
import type { Comment, Group, Segment } from '../model/types';
import { groupSegments, inGroup, siblingsOf, stageChildren, tripSegments, type StageChild } from './tree';

/** Commands for the segment operations in model/edit-ops.ts, shared by the modules that offer them. */

const nextSibling = (store: TripStore, seg: Segment): StageChild | undefined => {
  const list = siblingsOf(store, seg);
  return list[list.findIndex((s) => s.id === seg.id) + 1];
};

/** The segment right after this one in its group (or among its stage's ungrouped items). */
export function nextSegment(store: TripStore, seg: Segment): Segment | undefined {
  const next = nextSibling(store, seg);
  return next?.type === 'segment' ? next : undefined;
}

/** An order key right after `seg` among its siblings. */
function orderAfter(store: TripStore, seg: Segment): string {
  return keyBetween(seg.order, nextSibling(store, seg)?.order ?? null);
}

/** `wanted`, or the first free "name (n)" if a segment of the trip already has it. */
export function uniqueName(store: TripStore, wanted: string): string {
  const taken = new Set(store.list('segment').map((s) => s.name));
  if (!taken.has(wanted)) return wanted;
  const base = wanted.replace(/ \(\d+\)$/, '');
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

function copyOf(store: TripStore, seg: Segment, geometry: SegmentGeometry, name: string): Change {
  const { updatedAt: _a, updatedBy: _b, deleted: _c, ...rest } = seg;
  return edits.create<Segment>({ ...rest, ...geometry, id: newId(), name: uniqueName(store, name), order: orderAfter(store, seg) });
}

export interface Names {
  label: string;
  /** Name of the new segment, from the original's; a number is added if it's taken. */
  name: (original: string) => string;
}

/** Splits at a distance along the segment; the second part becomes a new segment right after it. */
export function splitCommand(store: TripStore, seg: Segment, distM: number, names: Names): { command: Command; newId: string } | null {
  const parts = splitAt(seg, distM);
  if (!parts) return null;
  const created = copyOf(store, seg, parts[1], names.name(seg.name));
  return {
    command: { label: names.label, changes: [edits.update<Segment>(store, seg.id, parts[0]), created] },
    newId: created.id,
  };
}

/** Removes the part between two distances. A cut in the middle leaves two segments. */
export function eraseCommand(store: TripStore, seg: Segment, fromM: number, toM: number, names: Names): Command {
  const { head, tail } = eraseRange(seg, fromM, toM);
  const changes: Change[] = [];
  if (!head && !tail) changes.push(edits.remove(store, seg.id));
  else if (head && tail) changes.push(edits.update<Segment>(store, seg.id, head), copyOf(store, seg, tail, names.name(seg.name)));
  else changes.push(edits.update<Segment>(store, seg.id, (head ?? tail)!));
  return { label: names.label, changes };
}

/** Appends `b` to `a` and deletes `b`; its comments move to `a`. */
export function mergeCommand(store: TripStore, a: Segment, b: Segment, label: string): Command {
  const comments = store.list('comment', (c) => c.targetId === b.id);
  return {
    label,
    changes: [
      edits.update<Segment>(store, a.id, mergeGeometry(a, b)),
      edits.remove(store, b.id),
      ...comments.map((c) => edits.update<Comment>(store, c.id, { targetId: a.id })),
    ],
  };
}

export function reverseCommand(store: TripStore, seg: Segment, label: string): Command {
  return { label, changes: [edits.update<Segment>(store, seg.id, reverseGeometry(seg))] };
}

export function duplicateCommand(store: TripStore, seg: Segment, names: Names): { command: Command; newId: string } {
  const created = copyOf(store, seg, copyGeometry(seg), names.name(seg.name));
  return { command: { label: names.label, changes: [created] }, newId: created.id };
}

/** Moves the segment to the end of another stage. */
export function moveToStageCommand(store: TripStore, seg: Segment, stageId: string, label: string): Command | null {
  if (seg.stageId === stageId || !store.get(stageId, 'stage')) return null;
  const order = keyBetween(stageChildren(store, stageId).at(-1)?.order ?? null, null);
  return { label, changes: [edits.update<Segment>(store, seg.id, { stageId, groupId: undefined, order })] };
}

/** Gives an imported track anchors so it can be edited; it takes its travel mode's geometry type. */
export function makeEditableCommand(store: TripStore, seg: Segment, label: string): Command | null {
  if (seg.geomType !== 'imported') return null;
  const geometry = editableGeometry(seg);
  if (geometry.anchors.length < 2) return null;
  return { label, changes: [edits.update<Segment>(store, seg.id, { ...geometry, geomType: MODES[seg.mode].geomType })] };
}

/** Segments sorted in trip order. */
export function inTripOrder(store: TripStore, segments: Segment[]): Segment[] {
  const rank = new Map(tripSegments(store).map((s, i) => [s.id, i]));
  return [...segments].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

/**
 * Fuses segments into the first one, in the given order: each is appended (joined by a new leg
 * where they don't touch) and then deleted; their comments move to the first.
 */
export function mergeManyCommand(store: TripStore, segments: Segment[], label: string): Command | null {
  const [first, ...rest] = segments;
  if (!first || !rest.length) return null;
  let geometry: SegmentGeometry = { anchors: first.anchors, legs: first.legs, stats: first.stats };
  for (const s of rest) geometry = mergeGeometry({ ...geometry, geomType: first.geomType }, s);
  const ids = new Set(rest.map((s) => s.id));
  const comments = store.list('comment', (c) => ids.has(c.targetId));
  return {
    label,
    changes: [
      edits.update<Segment>(store, first.id, geometry),
      ...rest.map((s) => edits.remove(store, s.id)),
      ...comments.map((c) => edits.update<Comment>(store, c.id, { targetId: first.id })),
    ],
  };
}

/** Where items go: directly in a stage, or in one of its groups. */
export interface Container {
  stageId: string;
  groupId?: string;
}

/**
 * Moves segments and groups, in this order, into a container: before `beforeId`, or at the end
 * when null. Groups only go directly into a stage (they're skipped when the target is a group);
 * a group moving to another stage takes its segments along.
 */
export function moveIntoCommand(store: TripStore, ids: string[], to: Container, beforeId: string | null, label: string): Command | null {
  if (!store.get(to.stageId, 'stage')) return null;
  const group = to.groupId ? store.get(to.groupId, 'group') : undefined;
  if (to.groupId && group?.stageId !== to.stageId) return null;
  const moving = new Set(ids);
  const list: StageChild[] = group ? groupSegments(store, group.id) : stageChildren(store, to.stageId);
  const others = list.filter((s) => !moving.has(s.id));
  const at = beforeId ? others.findIndex((s) => s.id === beforeId) : others.length;
  const index = at < 0 ? others.length : at;
  let prev = others[index - 1]?.order ?? null;
  const next = others[index]?.order ?? null;
  const changes: Change[] = [];
  for (const id of ids) {
    const e = store.get(id);
    if (e?.type === 'segment') {
      const order = keyBetween(prev, next);
      prev = order;
      changes.push(edits.update<Segment>(store, id, { stageId: to.stageId, groupId: group?.id, order }));
    } else if (e?.type === 'group' && !group) {
      const order = keyBetween(prev, next);
      prev = order;
      changes.push(edits.update<Group>(store, id, { stageId: to.stageId, order }));
      if (e.stageId !== to.stageId) {
        for (const s of groupSegments(store, id)) if (!moving.has(s.id)) changes.push(edits.update<Segment>(store, s.id, { stageId: to.stageId }));
      }
    }
  }
  return changes.length ? { label, changes } : null;
}

/** Moves segments, in this order, directly into a stage: before `beforeId`, or at the end when null. */
export function moveSegmentsCommand(store: TripStore, ids: string[], stageId: string, beforeId: string | null, label: string): Command | null {
  return moveIntoCommand(store, ids.filter((id) => store.get(id, 'segment')), { stageId }, beforeId, label);
}

/**
 * Puts segments of one stage into a new group, placed where the first of them is (in trip
 * order). Segments of other stages are left alone. Null when there is nothing to group.
 */
export function groupCommand(store: TripStore, segments: Segment[], name: string, label: string): { command: Command; groupId: string } | null {
  const sorted = inTripOrder(store, segments);
  const first = sorted[0];
  if (!first) return null;
  const members = sorted.filter((s) => s.stageId === first.stageId);
  const children = stageChildren(store, first.stageId);
  const anchor = inGroup(store, first) ? children.find((c) => c.id === first.groupId) : first;
  const index = children.findIndex((c) => c.id === anchor?.id);
  const ids = new Set(members.map((s) => s.id));
  const prev = children.slice(0, Math.max(index, 0)).filter((c) => !ids.has(c.id)).at(-1)?.order ?? null;
  const next = children.slice(index).find((c) => !ids.has(c.id))?.order ?? null;
  const id = newId();
  const changes: Change[] = [
    edits.create<Group>({ id, type: 'group', tripId: first.tripId, stageId: first.stageId, order: keyBetween(prev, next), name, notes: '' }),
  ];
  let order: string | null = null;
  for (const s of members) {
    order = keyBetween(order, null);
    changes.push(edits.update<Segment>(store, s.id, { groupId: id, order }));
  }
  return { command: { label, changes }, groupId: id };
}

/** Removes the group and leaves its segments in the stage, where the group was. */
export function ungroupCommand(store: TripStore, groupId: string, label: string): Command | null {
  const group = store.get(groupId, 'group');
  if (!group) return null;
  const children = stageChildren(store, group.stageId);
  const index = children.findIndex((c) => c.id === groupId);
  let prev = children[index - 1]?.order ?? null;
  const next = children[index + 1]?.order ?? null;
  const changes: Change[] = groupSegments(store, groupId).map((s) => {
    const order = keyBetween(prev, next);
    prev = order;
    return edits.update<Segment>(store, s.id, { groupId: undefined, order });
  });
  changes.push(edits.remove(store, groupId));
  return { label, changes };
}

/** Soft-deletes these entities, and the segments of any group among them (each once). */
export function removeChanges(store: TripStore, ids: string[]): Change[] {
  const all = new Set<string>();
  for (const id of ids) {
    if (store.get(id, 'group')) for (const s of groupSegments(store, id)) all.add(s.id);
    if (store.get(id)) all.add(id);
  }
  return [...all].map((id) => edits.remove(store, id));
}

/** Soft-deletes a group and its segments. */
export function deleteGroupCommand(store: TripStore, groupId: string, label: string): Command {
  return { label, changes: [...groupSegments(store, groupId).map((s) => edits.remove(store, s.id)), edits.remove(store, groupId)] };
}
