import { MODES } from '../config/modes';
import { edits, type Change, type Command } from '../core/commands';
import type { TripStore } from '../core/store';
import { copyGeometry, editableGeometry, eraseRange, mergeGeometry, reverseGeometry, splitAt } from '../model/edit-ops';
import { newId } from '../model/ids';
import { compareOrder, keyBetween } from '../model/order';
import type { SegmentGeometry } from '../model/segment';
import type { Comment, Segment } from '../model/types';

/** Commands for the segment operations in model/edit-ops.ts, shared by the modules that offer them. */

const siblings = (store: TripStore, stageId: string) => store.list('segment', (s) => s.stageId === stageId).sort(compareOrder);

export function nextSegment(store: TripStore, seg: Segment): Segment | undefined {
  const list = siblings(store, seg.stageId);
  return list[list.findIndex((s) => s.id === seg.id) + 1];
}

/** An order key right after `seg` in its stage. */
function orderAfter(store: TripStore, seg: Segment): string {
  return keyBetween(seg.order, nextSegment(store, seg)?.order ?? null);
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
  const order = keyBetween(siblings(store, stageId).at(-1)?.order ?? null, null);
  return { label, changes: [edits.update<Segment>(store, seg.id, { stageId, order })] };
}

/** Gives an imported track anchors so it can be edited; it takes its travel mode's geometry type. */
export function makeEditableCommand(store: TripStore, seg: Segment, label: string): Command | null {
  if (seg.geomType !== 'imported') return null;
  const geometry = editableGeometry(seg);
  if (geometry.anchors.length < 2) return null;
  return { label, changes: [edits.update<Segment>(store, seg.id, { ...geometry, geomType: MODES[seg.mode].geomType })] };
}

/** Segments sorted in trip order: by stage, then by their order in the stage. */
export function inTripOrder(store: TripStore, segments: Segment[]): Segment[] {
  const stageRank = new Map(store.list('stage').sort(compareOrder).map((s, i) => [s.id, i]));
  return [...segments].sort((a, b) => (stageRank.get(a.stageId) ?? 0) - (stageRank.get(b.stageId) ?? 0) || compareOrder(a, b));
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

/** Moves segments, in this order, into a stage: before `beforeId`, or at the end when null. */
export function moveSegmentsCommand(store: TripStore, ids: string[], stageId: string, beforeId: string | null, label: string): Command | null {
  const moving = new Set(ids);
  const others = siblings(store, stageId).filter((s) => !moving.has(s.id));
  const at = beforeId ? others.findIndex((s) => s.id === beforeId) : others.length;
  const index = at < 0 ? others.length : at;
  let prev = others[index - 1]?.order ?? null;
  const next = others[index]?.order ?? null;
  const changes = ids.flatMap((id) => {
    if (!store.get(id, 'segment')) return [];
    const order = keyBetween(prev, next);
    prev = order;
    return [edits.update<Segment>(store, id, { stageId, order })];
  });
  return changes.length ? { label, changes } : null;
}
