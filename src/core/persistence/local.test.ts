import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../../model/types';
import { stage } from '../../test/fixtures';
import { TripStore } from '../store';
import { attachDebouncedSave } from './local';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('attachDebouncedSave', () => {
  it('batches local changes and skips loaded ones', async () => {
    const store = new TripStore();
    const writes: Entity[][] = [];
    attachDebouncedSave(store, { write: async (list) => void writes.push(list) }, () => {}, 100);

    store.apply([stage('s0', 'U')], 'load');
    store.apply([stage('s1', 'V')], 'local');
    store.apply([stage('s2', 'W')], 'remote');
    store.apply([stage('s1', 'V', { name: 'renamed' })], 'local');
    await vi.advanceTimersByTimeAsync(150);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.map((e) => e.id).sort()).toEqual(['s1', 's2']);
    expect(writes[0]!.find((e) => e.id === 's1')).toMatchObject({ name: 'renamed' });
  });

  it('retries entities whose write failed', async () => {
    const store = new TripStore();
    const write = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const saver = attachDebouncedSave(store, { write }, onError, 100);

    store.apply([stage('s1', 'V')], 'local');
    await vi.advanceTimersByTimeAsync(150);
    expect(onError).toHaveBeenCalledOnce();

    await saver.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0].map((e: Entity) => e.id)).toEqual(['s1']);
  });
});
