import { MODES } from '../config/modes';
import { edits, type Change, type Command } from '../core/commands';
import type { TripStore } from '../core/store';
import { copyGeometry, editableGeometry, eraseRange, mergeGeometry, reverseGeometry, splitAt } from '../model/edit-ops';
import { chainChanges, chainSegments, type Chain } from './chain';
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

export interface MergeResult {
  command: Command;
  /** How the segments were put end to end. */
  chain: Chain;
  /** The order differs from the trip order. */
  reordered: boolean;
  /** Segments turned round to fit. */
  reversed: number;
  /** Largest distance bridged between two segments, in metres. */
  maxGapM: number;
}

/**
 * Fuses segments into one: they are put end to end first (best order, segments turned round
 * where they run the other way), then joined, with a new leg across any gap. The result keeps
 * the identity of `keepId` (default: the first in trip order); the others are deleted and their
 * comments move to it. Null with fewer than two segments.
 */
export function smartMergeCommand(store: TripStore, segments: Segment[], label: string, keepId?: string): MergeResult | null {
  if (segments.length < 2) return null;
  const sorted = inTripOrder(store, segments);
  const keep = sorted.find((s) => s.id === keepId) ?? sorted[0]!;
  const chain = chainSegments(sorted);
  const parts = chain.links.map((l) => ({ ...l.seg, ...(l.reversed ? reverseGeometry(l.seg) : {}) }));
  let geometry: SegmentGeometry = { anchors: parts[0]!.anchors, legs: parts[0]!.legs, stats: parts[0]!.stats };
  for (const part of parts.slice(1)) geometry = mergeGeometry({ ...geometry, geomType: keep.geomType }, part);
  const others = sorted.filter((s) => s.id !== keep.id);
  const ids = new Set(others.map((s) => s.id));
  const comments = store.list('comment', (c) => ids.has(c.targetId));
  return {
    command: {
      label,
      changes: [
        edits.update<Segment>(store, keep.id, geometry),
        ...others.map((s) => edits.remove(store, s.id)),
        ...comments.map((c) => edits.update<Comment>(store, c.id, { targetId: keep.id })),
      ],
    },
    chain,
    ...chainChanges(sorted, chain),
    maxGapM: Math.max(0, ...chain.gapsM),
  };
}

export interface ArrangeResult {
  command: Command;
  /** Segments that changed place. */
  moved: number;
  /** Segments turned round. */
  reversed: number;
}

/**
 * Puts segments in order along the route, each in its own list (its group, or its stage's
 * ungrouped items): they swap places so that each starts where the previous one ends, and those
 * running the other way are turned round (unless `reverse` is false). Null when nothing changes.
 */
export function arrangeCommand(store: TripStore, segments: Segment[], label: string, { reverse = true } = {}): ArrangeResult | null {
  const lists = new Map<string, Segment[]>();
  for (const seg of inTripOrder(store, segments)) {
    const key = inGroup(store, seg) ? `g:${seg.groupId}` : `s:${seg.stageId}`;
    lists.set(key, [...(lists.get(key) ?? []), seg]);
  }
  const changes: Change[] = [];
  let moved = 0;
  let reversed = 0;
  for (const list of lists.values()) {
    if (list.length < 2) continue;
    const slots = list.map((s) => s.order);
    chainSegments(list, { reverse }).links.forEach((link, i) => {
      const patch: Partial<Segment> = {};
      if (link.seg.order !== slots[i]) {
        patch.order = slots[i]!;
        moved++;
      }
      if (link.reversed) {
        Object.assign(patch, reverseGeometry(link.seg));
        reversed++;
      }
      if (Object.keys(patch).length) changes.push(edits.update<Segment>(store, link.seg.id, patch));
    });
  }
  return changes.length ? { command: { label, changes }, moved, reversed } : null;
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
 * order), and in order along the route (their directions are left as they are). Segments of
 * other stages are left alone. Null when there is nothing to group.
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
  for (const { seg } of chainSegments(members, { reverse: false }).links) {
    order = keyBetween(order, null);
    changes.push(edits.update<Segment>(store, seg.id, { groupId: id, order }));
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
