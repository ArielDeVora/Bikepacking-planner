import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Segment } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { addStageCommand, moveTopCommand } from '../../lib/route-edits';
import { sortedStages } from '../../lib/tree';
import { deleteStage } from './actions';

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
    const cmd = addStageCommand(store, TRIP_ID, 'New', 'add');
    commands.run(cmd);
    expect(names().at(-1)).toBe(cmd.changes[0]!.id);
  });

  it('moves several stages at once', () => {
    commands.run(moveTopCommand(store, ['c', 'a'], undefined, 'b', 'move')!);
    expect(names()).toEqual(['c', 'a', 'b']);
    commands.run(moveTopCommand(store, ['c'], undefined, null, 'move')!);
    expect(names()).toEqual(['a', 'b', 'c']);
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
