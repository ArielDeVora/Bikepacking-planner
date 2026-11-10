import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandStack, edits } from '../commands';
import { TripStore } from '../store';
import type { Stage } from '../../model/types';
import { stage, trip } from '../../test/fixtures';
import type { Commit } from './diff';
import { HistoryRecorder } from './recorder';

let store: TripStore;
let commands: CommandStack;
let saved: Commit[];
let recorder: HistoryRecorder;

beforeEach(() => {
  vi.useFakeTimers();
  store = new TripStore();
  store.apply([trip(), stage('a', 'V')], 'load');
  commands = new CommandStack(store, () => 'u1');
  saved = [];
  recorder = new HistoryRecorder(commands, {
    tripId: () => 'trip-1',
    userId: () => 'u1',
    label: (kind, l) => (kind === 'edit' ? l : `${kind}: ${l}`),
    save: (c) => saved.push(c),
    idleMs: 1000,
  });
});

const rename = (name: string, mergeKey?: string) =>
  commands.run({ label: 'rename', changes: [edits.update<Stage>(store, 'a', { name })], ...(mergeKey ? { mergeKey } : {}) });

describe('history recorder', () => {
  it('saves one commit per command', () => {
    rename('One');
    rename('Two');
    expect(saved.map((c) => [c.label, c.changes[0]!.after])).toEqual([
      ['rename', { name: 'One' }],
      ['rename', { name: 'Two' }],
    ]);
  });

  it('merges typing into one commit, finished after a pause', () => {
    rename('T', 'k');
    rename('Tw', 'k');
    rename('Two', 'k');
    expect(saved).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.changes[0]).toMatchObject({ before: { name: 'a' }, after: { name: 'Two' } });
  });

  it('records undo and redo, and restores with their target', () => {
    rename('One');
    commands.undo();
    commands.redo();
    recorder.markRestore('c0');
    rename('Back');
    expect(saved.map((c) => [c.kind, c.label])).toEqual([
      ['edit', 'rename'],
      ['undo', 'undo: rename'],
      ['redo', 'redo: rename'],
      ['restore', 'restore: rename'],
    ]);
    expect(saved[1]!.changes[0]).toMatchObject({ before: { name: 'One' }, after: { name: 'a' } });
    expect(saved[3]!.restoredTo).toBe('c0');
  });
});
