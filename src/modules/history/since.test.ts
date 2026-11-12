import { describe, expect, it } from 'vitest';
import type { Entity } from '../../model/types';
import { isEmpty, sinceLastVisit } from './since';

const base = { tripId: 't', deleted: false };
const e = (id: string, type: string, updatedBy: string, updatedAt: number, extra: object = {}) =>
  ({ ...base, id, type, updatedBy, updatedAt, ...extra }) as unknown as Entity;
const mine = (id: string) => id === 'me';

describe('since your last visit', () => {
  const entities = [
    e('s1', 'segment', 'zoe', 50),
    e('s2', 'segment', 'zoe', 200),
    e('s3', 'segment', 'zoe', 300, { deleted: true }),
    e('p1', 'poi', 'me', 400),
    e('v1', 'vote', 'nasty', 250),
    e('c1', 'comment', 'nasty', 260, { body: 'hi @Me', mentions: ['me'], createdAt: 260 }),
    e('c2', 'comment', 'nasty', 270, { body: 'yo', createdAt: 270 }),
  ];

  it('counts what others did after the last visit', () => {
    const s = sinceLastVisit(entities, 100, mine);
    expect(s.people).toEqual([
      { userId: 'nasty', edits: 0, comments: 2, votes: 1 },
      { userId: 'zoe', edits: 2, comments: 0, votes: 0 },
    ]);
    expect(s.mentions.map((c) => c.id)).toEqual(['c1']);
    expect(s.latest?.id).toBe('s2');
  });

  it('is empty when only I changed things', () => {
    expect(isEmpty(sinceLastVisit(entities, 350, mine))).toBe(true);
  });

  it('counts places suggested through follow links per follower', () => {
    const suggested = [
      e('f1', 'poi', '', 500, { followerId: 'x', createdBy: 'follower:x', suggestedBy: 'Mum', name: 'Lake' }),
      e('f2', 'poi', '', 600, { followerId: 'x', createdBy: 'follower:x', suggestedBy: 'Mum', name: 'Pass' }),
      e('f3', 'poi', '', 50, { followerId: 'y', createdBy: 'follower:y', suggestedBy: 'Léa', name: 'Old' }),
    ];
    const s = sinceLastVisit([...entities, ...suggested], 100, mine);
    expect(s.suggestions).toEqual([{ name: 'Mum', count: 2 }]);
    expect(s.latest?.id).toBe('f2');
    expect(isEmpty(sinceLastVisit(suggested, 100, mine))).toBe(false);
  });
});
