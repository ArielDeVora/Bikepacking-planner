import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack, edits } from '../core/commands';
import { TripStore } from '../core/store';
import { segmentLength } from '../model/edit-ops';
import { compareOrder } from '../model/order';
import { importedGeometry, insertAnchor } from '../model/segment';
import type { Comment, LngLat, Segment } from '../model/types';
import { stage, trip, TRIP_ID } from '../test/fixtures';
import {
  duplicateCommand,
  inTripOrder,
  mergeManyCommand,
  moveSegmentsCommand,
  eraseCommand,
  makeEditableCommand,
  mergeCommand,
  moveToStageCommand,
  nextSegment,
  reverseCommand,
  splitCommand,
} from './segment-edits';

let store: TripStore;
let commands: CommandStack;
const names = { label: 'edit', name: (n: string) => `${n} (2)` };

function add(id: string, order: string, points: LngLat[], geomType: Segment['geomType'] = 'manual', stageId = 'a'): Segment {
  let g = { anchors: [] as Segment['anchors'], legs: [] as Segment['legs'], geomType };
  for (const p of points) g = { ...insertAnchor(g, g.anchors.length, p), geomType };
  const seg = { id, type: 'segment', tripId: TRIP_ID, stageId, order, name: id, notes: '', mode: 'bike', stats: { lengthM: 0, ascentM: 0, descentM: 0 }, ...g } as Segment;
  commands.run({ label: 'add', changes: [edits.create<Segment>(seg)] });
  return store.get(id, 'segment')!;
}

const order = (stageId = 'a') => store.list('segment', (s) => s.stageId === stageId).sort(compareOrder).map((s) => s.name);

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), stage('a', 'V'), stage('b', 'X')], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('segment edit commands', () => {
  it('splits into two segments, the second right after the first', () => {
    const s = add('s', 'V', [[7, 45], [7.02, 45]]);
    add('t', 'X', [[8, 45], [8.01, 45]]);
    const res = splitCommand(store, s, segmentLength(s) / 2, names)!;
    commands.run(res.command);
    expect(order()).toEqual(['s', 's (2)', 't']);
    expect(store.get(res.newId, 'segment')!.anchors[0]!.lngLat[0]).toBeCloseTo(7.01, 4);
    commands.undo();
    expect(order()).toEqual(['s', 't']);
  });

  it('erases a middle part, or the whole segment', () => {
    const s = add('s', 'V', [[7, 45], [7.03, 45]]);
    const len = segmentLength(s);
    commands.run(eraseCommand(store, s, len / 3, (2 * len) / 3, names));
    expect(order()).toEqual(['s', 's (2)']);
    const head = store.get('s', 'segment')!;
    commands.run(eraseCommand(store, head, 0, segmentLength(head), names));
    expect(order()).toEqual(['s (2)']);
  });

  it('merges with the next segment and moves its comments', () => {
    const s = add('s', 'V', [[7, 45], [7.01, 45]]);
    const t = add('t', 'X', [[7.01, 45], [7.02, 45]]);
    expect(nextSegment(store, s)!.id).toBe('t');
    const comment = { id: 'c', type: 'comment', tripId: TRIP_ID, targetId: 't', body: 'hi', authorId: 'u1', createdAt: 0 } as Comment;
    commands.run({ label: 'c', changes: [edits.create<Comment>(comment)] });
    commands.run(mergeCommand(store, s, t, 'merge'));
    expect(order()).toEqual(['s']);
    expect(store.get('s', 'segment')!.anchors).toHaveLength(3);
    expect(store.get('c', 'comment')!.targetId).toBe('s');
  });

  it('reverses, duplicates and moves between stages', () => {
    const s = add('s', 'V', [[7, 45], [7.01, 45]]);
    commands.run(reverseCommand(store, s, 'rev'));
    expect(store.get('s', 'segment')!.anchors[0]!.lngLat[0]).toBe(7.01);
    const dup = duplicateCommand(store, store.get('s', 'segment')!, names);
    commands.run(dup.command);
    expect(order()).toEqual(['s', 's (2)']);
    commands.run(moveToStageCommand(store, store.get(dup.newId, 'segment')!, 'b', 'move')!);
    expect(order('b')).toEqual(['s (2)']);
    expect(moveToStageCommand(store, store.get('s', 'segment')!, 'a', 'move')).toBeNull();
  });

  it('numbers new segments so names stay unique', () => {
    const s = add('Day 1', 'V', [[7, 45], [7.03, 45]]);
    const keep = { label: 'split', name: (n: string) => n };
    commands.run(splitCommand(store, s, segmentLength(s) / 3, keep)!.command);
    const second = store.list('segment').find((x) => x.name === 'Day 1 (2)')!;
    commands.run(splitCommand(store, second, segmentLength(second) / 2, keep)!.command);
    expect(order()).toEqual(['Day 1', 'Day 1 (2)', 'Day 1 (3)']);
  });

  it('makes imported tracks editable', () => {
    const coords: [number, number, number][] = [];
    for (let i = 0; i <= 20; i++) coords.push([7 + i * 0.001, 45 + (i > 10 ? (i - 10) * 0.001 : 0), 100]);
    const seg = { id: 'imp', type: 'segment', tripId: TRIP_ID, stageId: 'a', order: 'V', name: 'imp', notes: '', mode: 'bike', geomType: 'imported', ...importedGeometry([coords]) } as Segment;
    commands.run({ label: 'add', changes: [edits.create<Segment>(seg)] });
    commands.run(makeEditableCommand(store, store.get('imp', 'segment')!, 'edit')!);
    const after = store.get('imp', 'segment')!;
    expect(after.geomType).toBe('routed');
    expect(after.anchors.length).toBe(3);
    expect(after.legs.every((l) => !l.status)).toBe(true);
    expect(makeEditableCommand(store, after, 'edit')).toBeNull();
  });
});

describe('several segments at once', () => {
  it('fuses segments in order into the first', () => {
    const a = add('a', 'V', [[7, 45], [7.01, 45]]);
    const b = add('b', 'X', [[7.01, 45], [7.02, 45]]);
    const c = add('c', 'Y', [[7.05, 45], [7.06, 45]], 'manual', 'b');
    commands.run(mergeManyCommand(store, inTripOrder(store, [c, a, b]), 'fuse')!);
    expect(store.list('segment').map((s) => s.id)).toEqual(['a']);
    expect(store.get('a', 'segment')!.anchors).toHaveLength(5);
    expect(mergeManyCommand(store, [store.get('a', 'segment')!], 'fuse')).toBeNull();
  });

  it('moves segments into a stage at a given place', () => {
    add('a', 'V', [[7, 45], [7.01, 45]]);
    add('b', 'X', [[7, 45], [7.01, 45]]);
    add('x', 'V', [[7, 45], [7.01, 45]], 'manual', 'b');
    add('y', 'X', [[7, 45], [7.01, 45]], 'manual', 'b');
    commands.run(moveSegmentsCommand(store, ['b', 'a'], 'b', 'y', 'move')!);
    expect(order('b')).toEqual(['x', 'b', 'a', 'y']);
    commands.run(moveSegmentsCommand(store, ['x'], 'b', null, 'move')!);
    expect(order('b')).toEqual(['b', 'a', 'y', 'x']);
  });
});
