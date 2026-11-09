import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Segment } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { addStage, deleteStage, moveSegment, moveStage, moveStagesCommand, sortedSegments, sortedStages } from './actions';

let store: TripStore;
let commands: CommandStack;

const names = () => sortedStages(store).map((s) => s.id);

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), stage('a', 'V'), stage('b', 'X'), stage('c', 'Z')], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('trip-tree actions', () => {
  it('appends a stage at the end', () => {
    const cmd = addStage(store, TRIP_ID, 'New', 'add');
    commands.run(cmd);
    expect(names().at(-1)).toBe(cmd.changes[0]!.id);
  });

  it('moves stages up and down', () => {
    commands.run(moveStage(store, 'c', -1, 'move')!);
    expect(names()).toEqual(['a', 'c', 'b']);
    commands.run(moveStage(store, 'a', 1, 'move')!);
    expect(names()).toEqual(['c', 'a', 'b']);
    commands.undo();
    commands.undo();
    expect(names()).toEqual(['a', 'b', 'c']);
  });

  it('moves several stages at once', () => {
    commands.run(moveStagesCommand(store, ['c', 'a'], 'b', 'move')!);
    expect(names()).toEqual(['c', 'a', 'b']);
    commands.run(moveStagesCommand(store, ['c'], null, 'move')!);
    expect(names()).toEqual(['a', 'b', 'c']);
  });

  it('returns null at the ends', () => {
    expect(moveStage(store, 'a', -1, 'move')).toBeNull();
    expect(moveStage(store, 'c', 1, 'move')).toBeNull();
  });

  it('deletes a stage with its segments, and undo restores both', () => {
    const seg = {
      id: 'seg1',
      type: 'segment',
      tripId: TRIP_ID,
      stageId: 'b',
      order: 'V',
      name: '',
      notes: '',
      mode: 'bike',
      geomType: 'routed',
      anchors: [],
      legs: [],
      stats: { lengthM: 0, ascentM: 0, descentM: 0 },
      updatedAt: 0,
      updatedBy: 'u1',
      deleted: false,
    } satisfies Segment;
    store.apply([seg], 'load');

    commands.run(deleteStage(store, 'b', 'delete'));
    expect(names()).toEqual(['a', 'c']);
    expect(store.get('seg1')).toBeUndefined();

    commands.undo();
    expect(names()).toEqual(['a', 'b', 'c']);
    expect(store.get('seg1')).toBeDefined();
  });
});

describe('segment ordering', () => {
  it('moves segments within their stage', () => {
    const make = (id: string, order: string): Segment => ({
      id,
      type: 'segment',
      tripId: TRIP_ID,
      stageId: 'a',
      order,
      name: id,
      notes: '',
      mode: 'bike',
      geomType: 'manual',
      anchors: [],
      legs: [],
      stats: { lengthM: 0, ascentM: 0, descentM: 0 },
      updatedAt: 0,
      updatedBy: 'u1',
      deleted: false,
    });
    store.apply([make('s1', 'V'), make('s2', 'X')], 'load');
    commands.run(moveSegment(store, 's2', -1, 'move')!);
    expect(sortedSegments(store, 'a').map((s) => s.id)).toEqual(['s2', 's1']);
    expect(moveSegment(store, 's2', -1, 'move')).toBeNull();

    commands.run(moveSegment(store, 's1', 1, 'move')!);
    expect(sortedSegments(store, 'b').map((s) => s.id)).toEqual(['s1']);
    store.apply([make('s3', 'V')].map((s) => ({ ...s, stageId: 'b' })), 'load');
    commands.run(moveSegment(store, 's1', -1, 'move')!);
    expect(sortedSegments(store, 'a').map((s) => s.id)).toEqual(['s2', 's1']);
    expect(sortedSegments(store, 'b').map((s) => s.id)).toEqual(['s3']);
  });
});
