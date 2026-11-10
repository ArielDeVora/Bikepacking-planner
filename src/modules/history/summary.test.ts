import { describe, expect, it } from 'vitest';
import type { ChangeDiff, Commit } from '../../core/history/diff';
import { lanes, summarize, touching } from './summary';

const diff = (before: ChangeDiff['before'], after: ChangeDiff['after']): ChangeDiff => ({ id: 's', type: 'segment', before, after });

describe('history summaries', () => {
  it('says what happened in plain words', () => {
    expect(summarize(diff(null, { name: 'x' }))).toEqual({ verb: 'created', fields: [] });
    expect(summarize(diff({ deleted: false }, { deleted: true })).verb).toBe('deleted');
    expect(summarize(diff({ deleted: true }, { deleted: false })).verb).toBe('restored');
    expect(summarize(diff({ anchors: [], legs: [], name: 'a' }, { anchors: [1], legs: [2], name: 'b' })).fields).toEqual(['route', 'name']);
    expect(summarize(diff({ foo: 1 }, { foo: 2 })).fields).toEqual(['other']);
  });

  it('gives each person a lane, and finds the commits that touch an item', () => {
    const c = (id: string, userId: string, ids: string[]): Commit => ({
      id,
      tripId: 't',
      userId,
      at: 0,
      label: id,
      kind: 'edit',
      changes: ids.map((x) => ({ id: x, type: 'segment', before: {}, after: {} })),
    });
    const list = [c('1', 'bob', ['a']), c('2', 'me', ['b']), c('3', 'bob', ['a', 'b'])];
    expect([...lanes(list)]).toEqual([
      ['bob', 0],
      ['me', 1],
    ]);
    expect(touching(list, 'a').map((x) => x.id)).toEqual(['1', '3']);
  });
});
