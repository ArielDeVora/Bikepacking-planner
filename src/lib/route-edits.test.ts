import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../core/commands';
import { TripStore } from '../core/store';
import type { Group, Route, Segment, Stage } from '../model/types';
import { stage, trip, TRIP_ID } from '../test/fixtures';
import {
  addRouteCommand,
  addStageCommand,
  deleteRouteCommand,
  dissolveRouteCommand,
  duplicateRouteCommand,
  makeRouteCommand,
  moveTopCommand,
} from './route-edits';
import { ancestorIds, routeSegments, routeStages, segmentsOf, sortedStages, tripChildren, tripSegments } from './tree';

let store: TripStore;
let commands: CommandStack;

const route = (id: string, order: string) =>
  ({ id, type: 'route', tripId: TRIP_ID, order, name: id, notes: '', updatedAt: 0, updatedBy: 'u1', deleted: false }) as Route;
const seg = (id: string, stageId: string, order: string, groupId?: string) =>
  ({
    id,
    type: 'segment',
    tripId: TRIP_ID,
    stageId,
    order,
    name: id,
    notes: '',
    mode: 'bike',
    geomType: 'manual',
    anchors: [{ id: `${id}-a`, lngLat: [7, 45] }],
    legs: [],
    stats: { lengthM: 1000, ascentM: 0, descentM: 0 },
    ...(groupId ? { groupId } : {}),
    updatedAt: 0,
    updatedBy: 'u1',
    deleted: false,
  }) as Segment;
const ids = (list: { id: string }[]) => list.map((x) => x.id);
const st = (id: string) => store.get(id, 'stage')!;

beforeEach(() => {
  store = new TripStore();
  commands = new CommandStack(store, () => 'u1');
  store.apply(
    [
      trip(),
      stage('a', 'V'),
      route('r', 'W'),
      stage('r1', 'V', { routeId: 'r' }),
      stage('r2', 'X', { routeId: 'r' }),
      stage('b', 'X'),
      seg('s1', 'r1', 'V'),
      seg('s2', 'r2', 'V'),
      seg('t1', 'b', 'V'),
    ],
    'load',
  );
});

describe('trip order with routes', () => {
  it('orders routes and loose stages together, then route stages', () => {
    expect(ids(tripChildren(store))).toEqual(['a', 'r', 'b']);
    expect(ids(sortedStages(store))).toEqual(['a', 'r1', 'r2', 'b']);
    expect(ids(tripSegments(store))).toEqual(['s1', 's2', 't1']);
    expect(ids(routeSegments(store, 'r'))).toEqual(['s1', 's2']);
    expect(ids(segmentsOf(store, 'r'))).toEqual(['s1', 's2']);
    expect(ancestorIds(store, store.get('s1', 'segment')!)).toEqual(['s1', 'r1', 'r']);
  });

  it('treats stages of a deleted route as loose', () => {
    store.apply([{ ...store.get('r', 'route')!, deleted: true }], 'load');
    expect(ids(tripChildren(store))).toContain('r1');
  });
});

describe('route commands', () => {
  it('adds stages at the end of a route or of the trip, and routes at the end', () => {
    const inRoute = addStageCommand(store, TRIP_ID, 'New', 'add', 'r');
    commands.run(inRoute);
    expect(ids(routeStages(store, 'r')).at(-1)).toBe(inRoute.changes[0]!.id);
    const loose = addStageCommand(store, TRIP_ID, 'Loose', 'add');
    commands.run(loose);
    expect(ids(tripChildren(store)).at(-1)).toBe(loose.changes[0]!.id);
    const r = addRouteCommand(store, TRIP_ID, 'R2', 'add');
    commands.run(r);
    expect(ids(tripChildren(store)).at(-1)).toBe(r.changes[0]!.id);
  });

  it('moves stages into and out of routes, and routes among the trip children', () => {
    commands.run(moveTopCommand(store, ['b'], 'r', 'r2', 'move')!);
    expect(ids(routeStages(store, 'r'))).toEqual(['r1', 'b', 'r2']);
    commands.run(moveTopCommand(store, ['r1'], undefined, 'a', 'move')!);
    expect(st('r1').routeId).toBeUndefined();
    expect(ids(tripChildren(store))).toEqual(['r1', 'a', 'r']);
    commands.run(moveTopCommand(store, ['r'], undefined, 'r1', 'move')!);
    expect(ids(tripChildren(store))).toEqual(['r', 'r1', 'a']);
    expect(moveTopCommand(store, ['r'], 'r', null, 'move')).toBeNull();
  });

  it('makes a route where the first stage was, and dissolves it back in place', () => {
    const res = makeRouteCommand(store, [st('b'), st('a')], 'New', 'make')!;
    commands.run(res.command);
    expect(ids(tripChildren(store))).toEqual([res.routeId, 'r']);
    expect(ids(routeStages(store, res.routeId))).toEqual(['a', 'b']);
    commands.run(dissolveRouteCommand(store, res.routeId, 'dissolve')!);
    expect(ids(tripChildren(store))).toEqual(['a', 'b', 'r']);
    expect(store.get(res.routeId)).toBeUndefined();
  });

  it('deletes a route with everything in it, and undo brings it back', () => {
    store.apply([{ id: 'g', type: 'group', tripId: TRIP_ID, stageId: 'r1', order: 'Z', name: 'g', notes: '', updatedAt: 0, updatedBy: 'u1', deleted: false } as Group], 'load');
    commands.run(deleteRouteCommand(store, 'r', 'delete'));
    expect(ids(tripSegments(store))).toEqual(['t1']);
    expect(store.get('g')).toBeUndefined();
    commands.undo();
    expect(ids(tripSegments(store))).toEqual(['s1', 's2', 't1']);
  });

  it('duplicates a route with its stages, groups and segments', () => {
    store.apply(
      [
        { id: 'g', type: 'group', tripId: TRIP_ID, stageId: 'r1', order: 'Z', name: 'g', notes: '', updatedAt: 0, updatedBy: 'u1', deleted: false } as Group,
        seg('s3', 'r1', 'V', 'g'),
      ],
      'load',
    );
    const res = duplicateRouteCommand(store, 'r', 'Copy', 'dup')!;
    commands.run(res.command);
    expect(ids(tripChildren(store))).toEqual(['a', 'r', res.routeId, 'b']);
    const copies = routeStages(store, res.routeId);
    expect(copies.map((s: Stage) => s.name)).toEqual(['r1', 'r2']);
    const copied = routeSegments(store, res.routeId);
    expect(copied.map((s) => s.name)).toEqual(['s1', 's3', 's2']);
    expect(copied.every((s) => !['s1', 's2', 's3'].includes(s.id))).toBe(true);
    const groupCopy = store.list('group', (g) => g.stageId === copies[0]!.id)[0]!;
    expect(copied.find((s) => s.name === 's3')!.groupId).toBe(groupCopy.id);
    expect(copied[0]!.anchors[0]!.id).not.toBe('s1-a');
  });
});
