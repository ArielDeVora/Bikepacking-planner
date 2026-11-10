import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack, edits } from '../core/commands';
import { TripStore } from '../core/store';
import { insertAnchor } from '../model/segment';
import type { Group, LngLat, Segment } from '../model/types';
import { stage, trip, TRIP_ID } from '../test/fixtures';
import { chainSegments } from './chain';
import { arrangeCommand, groupCommand, smartMergeCommand } from './segment-edits';
import { groupSegments, stageSegments } from './tree';

let store: TripStore;
let commands: CommandStack;

/** A straight segment between two points, along a line of longitude at 45°N (0.01° ≈ 790 m). */
function add(id: string, order: string, from: number, to: number, stageId = 'a'): Segment {
  let g = { anchors: [] as Segment['anchors'], legs: [] as Segment['legs'], geomType: 'manual' as const };
  for (const lng of [from, to]) g = { ...insertAnchor(g, g.anchors.length, [lng, 45] as LngLat), geomType: 'manual' };
  const seg = { id, type: 'segment', tripId: TRIP_ID, stageId, order, name: id, notes: '', mode: 'bike', stats: { lengthM: Math.abs(to - from) * 79000, ascentM: 0, descentM: 0 }, ...g } as Segment;
  commands.run({ label: 'add', changes: [edits.create<Segment>(seg)] });
  return store.get(id, 'segment')!;
}
const ends = (s: Segment) => [s.anchors[0]!.lngLat[0], s.anchors.at(-1)!.lngLat[0]];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), stage('a', 'V'), stage('b', 'X')], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('chaining segments', () => {
  it('keeps segments that already follow each other as they are', () => {
    const chain = chainSegments([add('p', 'V', 7, 7.1), add('q', 'W', 7.1, 7.2), add('r', 'X', 7.2, 7.3)]);
    expect(chain.links.map((l) => [l.seg.id, l.reversed])).toEqual([['p', false], ['q', false], ['r', false]]);
    expect(chain.gapsM).toEqual([0, 0]);
  });

  it('finds the order and turns round segments that run the other way', () => {
    // Along the route: p (7→7.1), q (7.1→7.2), r (7.2→7.3); q is stored backwards and the list is shuffled.
    const r = add('r', 'V', 7.2, 7.3);
    const q = add('q', 'W', 7.2, 7.1);
    const p = add('p', 'X', 7, 7.1);
    const chain = chainSegments([r, q, p]);
    expect(chain.links.map((l) => [l.seg.id, l.reversed])).toEqual([['p', false], ['q', true], ['r', false]]);
    expect(Math.max(...chain.gapsM)).toBeLessThan(1);
  });

  it('runs the chain the way that turns round the fewest kilometres', () => {
    // A long track stored "east to west" and a short one joining it: turn the short one, not the long one.
    const long = add('long', 'V', 7.5, 7.1);
    const short = add('short', 'W', 7.5, 7.6);
    const chain = chainSegments([long, short]);
    expect(chain.links.find((l) => l.seg.id === 'long')!.reversed).toBe(false);
    expect(chain.links.find((l) => l.seg.id === 'short')!.reversed).toBe(true);
  });

  it('can keep every direction and only change the order', () => {
    const q = add('q', 'V', 7.1, 7.2);
    const p = add('p', 'W', 7, 7.1);
    const chain = chainSegments([q, p], { reverse: false });
    expect(chain.links.map((l) => [l.seg.id, l.reversed])).toEqual([['p', false], ['q', false]]);
  });

  it('handles more segments than the exact search', () => {
    const list = Array.from({ length: 14 }, (_, i) => add(`s${i}`, `V${String(13 - i).padStart(2, '0')}`, 7 + i / 100, 7 + (i + 1) / 100));
    const chain = chainSegments([...list].reverse());
    expect(Math.max(...chain.gapsM)).toBeLessThan(1);
  });
});

describe('fusing and ordering', () => {
  it('fuses out-of-order and reversed segments into one clean line', () => {
    const r = add('r', 'V', 7.2, 7.3);
    const q = add('q', 'W', 7.2, 7.1);
    const p = add('p', 'X', 7, 7.1);
    const res = smartMergeCommand(store, [r, q, p], 'fuse', 'q')!;
    commands.run(res.command);
    expect(ids(store.list('segment'))).toEqual(['q']);
    const fused = store.get('q', 'segment')!;
    expect(fused.anchors.map((a) => a.lngLat[0])).toEqual([7, 7.1, 7.2, 7.3]);
    expect(res).toMatchObject({ reordered: true, reversed: 1 });
    expect(res.maxGapM).toBeLessThan(1);
    commands.undo();
    expect(ids(stageSegments(store, 'a')).sort()).toEqual(['p', 'q', 'r']);
  });

  it('puts segments in order in the places they occupy, turning round the backward ones', () => {
    const r = add('r', 'V', 7.2, 7.3);
    const q = add('q', 'W', 7.2, 7.1);
    const p = add('p', 'X', 7, 7.1);
    const res = arrangeCommand(store, [r, q, p], 'arrange')!;
    commands.run(res.command);
    expect(ids(stageSegments(store, 'a'))).toEqual(['p', 'q', 'r']);
    expect(ends(store.get('q', 'segment')!)).toEqual([7.1, 7.2]);
    expect(res).toMatchObject({ moved: 2, reversed: 1 });
    expect(arrangeCommand(store, stageSegments(store, 'a'), 'arrange')).toBeNull();
  });

  it('groups in order along the route without turning anything round', () => {
    const r = add('r', 'V', 7.2, 7.3);
    const p = add('p', 'W', 7, 7.1);
    const back = add('back', 'X', 7.4, 7.3);
    const q = add('q', 'Y', 7.1, 7.2);
    const res = groupCommand(store, [r, p, back, q], 'G', 'group')!;
    commands.run(res.command);
    expect(ids(groupSegments(store, res.groupId))).toEqual(['p', 'q', 'r', 'back']);
    expect(ends(store.get('back', 'segment')!)).toEqual([7.4, 7.3]);
    expect((store.get(res.groupId) as Group).stageId).toBe('a');
  });
});
