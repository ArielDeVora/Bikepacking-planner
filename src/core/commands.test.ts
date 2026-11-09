import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Stage } from '../model/types';
import { stage, trip } from '../test/fixtures';
import { CommandStack, edits } from './commands';
import { TripStore } from './store';

let store: TripStore;
let commands: CommandStack;

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), stage('s1', 'V', { name: 'Lyon' })], 'load');
  commands = new CommandStack(store, () => 'u2');
});

const rename = (name: string, mergeKey?: string) => ({
  label: 'rename',
  changes: [edits.update<Stage>(store, 's1', { name })],
  mergeKey,
});

describe('CommandStack', () => {
  it('applies, undoes and redoes an update', () => {
    commands.run(rename('Marseille'));
    expect(store.get('s1', 'stage')?.name).toBe('Marseille');
    expect(store.get('s1')?.updatedBy).toBe('u2');

    commands.undo();
    expect(store.get('s1', 'stage')?.name).toBe('Lyon');

    commands.redo();
    expect(store.get('s1', 'stage')?.name).toBe('Marseille');
  });

  it('undoes a create as a soft delete', () => {
    commands.run({
      label: 'add',
      changes: [edits.create<Stage>({ id: 's2', type: 'stage', tripId: 'trip-1', order: 'W', name: 'Nice', notes: '' })],
    });
    expect(store.get('s2')).toBeDefined();
    commands.undo();
    expect(store.get('s2')).toBeUndefined();
    expect(store.getRaw('s2')?.deleted).toBe(true);
    commands.redo();
    expect(store.get('s2')).toBeDefined();
  });

  it('undoes a soft delete', () => {
    commands.run({ label: 'delete', changes: [edits.remove(store, 's1')] });
    expect(store.get('s1')).toBeUndefined();
    commands.undo();
    expect(store.get('s1', 'stage')?.name).toBe('Lyon');
  });

  it('merges consecutive commands with the same key into one undo step', () => {
    commands.run(rename('M', 'typing'));
    commands.run(rename('Ma', 'typing'));
    commands.run(rename('Mar', 'typing'));
    expect(store.get('s1', 'stage')?.name).toBe('Mar');
    commands.undo();
    expect(store.get('s1', 'stage')?.name).toBe('Lyon');
    expect(get(commands.state).canUndo).toBe(false);
  });

  it('starts a new step after seal()', () => {
    commands.run(rename('A', 'typing'));
    commands.seal();
    commands.run(rename('B', 'typing'));
    commands.undo();
    expect(store.get('s1', 'stage')?.name).toBe('A');
  });

  it('clears the redo stack on a new command', () => {
    commands.run(rename('A'));
    commands.undo();
    expect(get(commands.state).canRedo).toBe(true);
    commands.run(rename('B'));
    expect(get(commands.state).canRedo).toBe(false);
  });

  it('publishes labels', () => {
    commands.run(rename('A'));
    expect(get(commands.state)).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'rename' });
  });
});
