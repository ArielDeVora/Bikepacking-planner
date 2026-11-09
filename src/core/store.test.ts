import { describe, expect, it, vi } from 'vitest';
import { stage, trip } from '../test/fixtures';
import { TripStore } from './store';

describe('TripStore', () => {
  it('hides soft-deleted entities from reads but keeps them raw', () => {
    const store = new TripStore();
    store.apply([trip(), stage('s1', 'V'), stage('s2', 'W', { deleted: true })], 'load');
    expect(store.list('stage').map((s) => s.id)).toEqual(['s1']);
    expect(store.get('s2')).toBeUndefined();
    expect(store.getRaw('s2')?.id).toBe('s2');
  });

  it('filters by type', () => {
    const store = new TripStore();
    store.apply([trip(), stage('s1', 'V')], 'load');
    expect(store.get('s1', 'stage')?.name).toBe('s1');
    expect(store.get('s1', 'trip')).toBeUndefined();
  });

  it('notifies listeners and bumps the version', () => {
    const store = new TripStore();
    const listener = vi.fn();
    const versions: number[] = [];
    store.onChange(listener);
    store.subscribe((v) => versions.push(v));
    store.apply([stage('s1', 'V')], 'remote');
    expect(listener).toHaveBeenCalledWith({ ids: ['s1'], origin: 'remote' });
    expect(versions).toEqual([0, 1]);
  });
});
