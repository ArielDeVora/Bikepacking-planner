import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../core/commands';
import { TripStore } from '../core/store';
import type { Group, Segment } from '../model/types';
import { deleteStage } from '../modules/trip-tree/actions';
import { createSegment } from '../modules/routes/actions';
import { stage, trip, TRIP_ID } from '../test/fixtures';
import {
  deleteGroupCommand,
  groupCommand,
  inTripOrder,
  moveIntoCommand,
  moveToStageCommand,
  nextSegment,
  removeChanges,
  ungroupCommand,
} from './segment-edits';
import { stageChildren, stageSegments, tripSegments } from './tree';

let store: TripStore;
let commands: CommandStack;

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
    anchors: [],
    legs: [],
    stats: { lengthM: 1000, ascentM: 0, descentM: 0 },
    ...(groupId ? { groupId } : {}),
    updatedAt: 0,
    updatedBy: 'u1',
    deleted: false,
  }) as Segment;
const group = (id: string, stageId: string, order: string) =>
  ({ id, type: 'group', tripId: TRIP_ID, stageId, order, name: id, notes: '', updatedAt: 0, updatedBy: 'u1', deleted: false }) as Group;

const ids = (list: { id: string }[]) => list.map((x) => x.id);
const get = (id: string) => store.get(id, 'segment')!;

beforeEach(() => {
  store = new TripStore();
  commands = new CommandStack(store, () => 'u1');
  store.apply([trip(), stage('a', 'V'), stage('b', 'X'), seg('s1', 'a', 'V'), seg('s2', 'a', 'W'), seg('s3', 'a', 'X'), seg('s4', 'a', 'Y'), seg('t1', 'b', 'V')], 'load');
});

describe('grouping', () => {
  it('groups segments where the first one was, and ungroups back in place', () => {
    const res = groupCommand(store, [get('s3'), get('s2')], 'G', 'group')!;
    commands.run(res.command);
    expect(ids(stageChildren(store, 'a'))).toEqual(['s1', res.groupId, 's4']);
    expect(ids(stageSegments(store, 'a'))).toEqual(['s1', 's2', 's3', 's4']);

    commands.run(ungroupCommand(store, res.groupId, 'ungroup')!);
    expect(store.get(res.groupId)).toBeUndefined();
    expect(ids(stageChildren(store, 'a'))).toEqual(['s1', 's2', 's3', 's4']);
    expect(get('s2').groupId).toBeUndefined();

    commands.undo();
    commands.undo();
    expect(ids(stageChildren(store, 'a'))).toEqual(['s1', 's2', 's3', 's4']);
    expect(store.list('group')).toEqual([]);
  });

  it('only groups the segments of the first stage', () => {
    const res = groupCommand(store, [get('t1'), get('s4')], 'G', 'group')!;
    commands.run(res.command);
    expect(store.get(res.groupId, 'group')!.stageId).toBe('a');
    expect(get('t1').groupId).toBeUndefined();
  });

  it('merges only with the next segment of the same group', () => {
    commands.run(groupCommand(store, [get('s2'), get('s3')], 'G', 'group')!.command);
    expect(nextSegment(store, get('s2'))?.id).toBe('s3');
    expect(nextSegment(store, get('s3'))).toBeUndefined();
    expect(nextSegment(store, get('s1'))).toBeUndefined();
  });
});

describe('moving with groups', () => {
  beforeEach(() => {
    store.apply([group('g', 'a', 'Xm'), seg('g1', 'a', 'V', 'g'), seg('g2', 'a', 'W', 'g')], 'load');
  });

  it('moves segments into a group and out again', () => {
    commands.run(moveIntoCommand(store, ['s1', 't1'], { stageId: 'a', groupId: 'g' }, 'g2', 'move')!);
    expect(ids(stageSegments(store, 'a'))).toEqual(['s2', 's3', 'g1', 's1', 't1', 'g2', 's4']);
    expect(get('t1').stageId).toBe('a');

    commands.run(moveIntoCommand(store, ['g1'], { stageId: 'b' }, null, 'move')!);
    expect(get('g1').groupId).toBeUndefined();
    expect(ids(stageSegments(store, 'b'))).toEqual(['g1']);
    expect(ids(tripSegments(store))).toEqual(['s2', 's3', 's1', 't1', 'g2', 's4', 'g1']);
  });

  it('moves a group to another stage with its segments', () => {
    commands.run(moveIntoCommand(store, ['g'], { stageId: 'b' }, 't1', 'move')!);
    expect(ids(stageChildren(store, 'b'))).toEqual(['g', 't1']);
    expect(get('g1').stageId).toBe('b');
    expect(ids(stageSegments(store, 'b'))).toEqual(['g1', 'g2', 't1']);
  });

  it('does not put a group inside a group', () => {
    store.apply([group('h', 'a', 'Z')], 'load');
    expect(moveIntoCommand(store, ['h'], { stageId: 'a', groupId: 'g' }, null, 'move')).toBeNull();
  });

  it('keeps trip order and moving to a stage consistent', () => {
    expect(ids(inTripOrder(store, [get('s4'), get('g2'), get('s1')]))).toEqual(['s1', 'g2', 's4']);
    commands.run(moveToStageCommand(store, get('g2'), 'b', 'move')!);
    expect(get('g2').groupId).toBeUndefined();
    expect(ids(stageSegments(store, 'b'))).toEqual(['t1', 'g2']);
  });

  it('draws new segments at the end of the selected group', () => {
    const { command, segmentId } = createSegment(store, {
      tripId: TRIP_ID,
      stageId: 'a',
      groupId: 'g',
      mode: 'bike',
      points: [
        [7, 45],
        [7.1, 45],
      ],
      label: 'draw',
      segmentName: (n) => `S${n}`,
      stageName: 'Stage',
    });
    commands.run(command);
    expect(ids(stageSegments(store, 'a'))).toEqual(['s1', 's2', 's3', 'g1', 'g2', segmentId, 's4']);
    expect(get(segmentId).name).toBe('S7');
  });

  it('deletes groups with their segments', () => {
    commands.run(deleteGroupCommand(store, 'g', 'delete'));
    expect(store.get('g1')).toBeUndefined();
    commands.undo();
    expect(ids(stageSegments(store, 'a'))).toContain('g2');

    expect(removeChanges(store, ['g', 'g1', 's1']).map((c) => c.id).sort()).toEqual(['g', 'g1', 'g2', 's1']);
    commands.run(deleteStage(store, 'a', 'delete'));
    expect(store.list('group')).toEqual([]);
  });
});
