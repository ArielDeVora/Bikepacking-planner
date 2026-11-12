import { describe, expect, it } from 'vitest';
import type { Entity } from '../../model/types';
import { computeBadges } from './badges';

const base = { tripId: 't', updatedAt: 0, updatedBy: '', deleted: false };
const e = (o: object) => ({ ...base, ...o }) as unknown as Entity;
const who = (id: string | undefined) => (id && ['a', 'b', 'c'].includes(id) ? id : null);
const ids = (m: Map<string, { badge: { id: string } }[]>, user: string) => (m.get(user) ?? []).map((x) => x.badge.id).sort();

describe('badges', () => {
  const entities = [
    e({ id: 'p1', type: 'poi', createdBy: 'a' }),
    e({ id: 'p2', type: 'poi', createdBy: 'a' }),
    e({ id: 'p3', type: 'poi', createdBy: 'b' }),
    e({ id: 'v1', type: 'vote', poiId: 'p3', userId: 'a', value: 2 }),
    e({ id: 'v2', type: 'vote', poiId: 'p3', userId: 'c', value: 2 }),
    e({ id: 'v3', type: 'vote', poiId: 'p3', userId: 'b', value: 2 }), // own place: doesn't count
    e({ id: 's1', type: 'segment', createdBy: 'c', stats: { lengthM: 120_000, ascentM: 900 } }),
    e({ id: 's2', type: 'segment', editedBy: 'b', stats: { lengthM: 50_000, ascentM: 2000 } }),
    e({ id: 'g1', type: 'gear', status: 'bought', boughtBy: 'b' }),
    e({ id: 'g2', type: 'gear', status: 'needed', boughtBy: 'a' }),
    e({ id: 'x', type: 'poi', createdBy: 'a', deleted: true }),
  ];

  it('gives each badge to whoever leads it', () => {
    const m = computeBadges(entities, who);
    expect(ids(m, 'a')).toEqual(['critic', 'scout']);
    expect(ids(m, 'b')).toEqual(['climber', 'critic', 'goat', 'quartermaster']);
    expect(ids(m, 'c')).toEqual(['cartographer', 'critic']);
    expect(m.get('b')!.find((x) => x.badge.id === 'goat')!.value).toBe(2);
  });

  it('needs a few late edits for the night owl', () => {
    const late = new Date(2027, 0, 1, 2).getTime();
    const edits = [1, 2, 3, 4, 5].map((i) => e({ id: `n${i}`, type: 'zone', editedBy: 'c', editedAt: late }));
    expect(ids(computeBadges(edits.slice(0, 4), who), 'c')).toEqual([]);
    expect(ids(computeBadges(edits, who), 'c')).toEqual(['nightOwl']);
  });
});
