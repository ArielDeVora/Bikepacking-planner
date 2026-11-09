import { describe, expect, it } from 'vitest';
import { TripStore } from '../core/store';
import type { Group, Segment } from '../model/types';
import { stage, trip, TRIP_ID } from '../test/fixtures';
import { segmentsOf, siblingsOf, stageChildren, stageSegments, tripSegments } from './tree';

const seg = (id: string, stageId: string, order: string, groupId?: string) =>
  ({ id, type: 'segment', tripId: TRIP_ID, stageId, order, groupId, deleted: false }) as unknown as Segment;
const group = (id: string, stageId: string, order: string) => ({ id, type: 'group', tripId: TRIP_ID, stageId, order, deleted: false }) as unknown as Group;

describe('trip order with groups', () => {
  const store = new TripStore();
  store.apply(
    [
      trip(),
      stage('a', 'V'),
      stage('b', 'X'),
      seg('s1', 'a', 'V'),
      group('g', 'a', 'W'),
      seg('g2', 'a', 'X', 'g'),
      seg('g1', 'a', 'V', 'g'),
      seg('s2', 'a', 'Y'),
      seg('orphan', 'a', 'Z', 'gone'),
      seg('t1', 'b', 'V'),
    ],
    'load',
  );

  it('orders groups and loose segments together, then group contents', () => {
    expect(stageChildren(store, 'a').map((c) => c.id)).toEqual(['s1', 'g', 's2', 'orphan']);
    expect(stageSegments(store, 'a').map((s) => s.id)).toEqual(['s1', 'g1', 'g2', 's2', 'orphan']);
    expect(tripSegments(store).map((s) => s.id)).toEqual(['s1', 'g1', 'g2', 's2', 'orphan', 't1']);
  });

  it('finds segments and siblings', () => {
    expect(segmentsOf(store, 'g').map((s) => s.id)).toEqual(['g1', 'g2']);
    expect(segmentsOf(store, 'b').map((s) => s.id)).toEqual(['t1']);
    expect(siblingsOf(store, store.get('g1', 'segment')!).map((s) => s.id)).toEqual(['g1', 'g2']);
    expect(siblingsOf(store, store.get('orphan', 'segment')!).map((s) => s.id)).toContain('g');
  });
});
