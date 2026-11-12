import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import { authorOf, distinctAuthors, FOLLOWER_COLOR, OTHERS_COLOR, type AuthorLookup } from './authors';

const people: Record<string, { id: string; name: string; color: string }> = {
  me: { id: 'me', name: 'Ariel', color: '#111111' },
  zoe: { id: 'zoe', name: 'Zoé', color: '#222222' },
  ben: { id: 'ben', name: 'Ben', color: '#333333' },
};
const cloud: AuthorLookup = {
  isMine: (id) => id === 'me' || id === 'my-old-browser-id',
  profileOf: (id) => people[id === 'my-old-browser-id' ? 'me' : id],
};

describe('place authors', () => {
  it('tells you, members and everyone else apart', () => {
    expect(authorOf(cloud, t, 'me')).toEqual({ key: 'me', name: 'You', color: '#111111' });
    expect(authorOf(cloud, t, 'my-old-browser-id').key).toBe('me');
    expect(authorOf(cloud, t, 'zoe')).toEqual({ key: 'zoe', name: 'Zoé', color: '#222222' });
    expect(authorOf(cloud, t, 'stranger')).toEqual({ key: 'others', name: 'Someone else', color: OTHERS_COLOR });
  });

  it('lists each author once: you, members by name, then everyone else', () => {
    const list = ['stranger', 'zoe', 'me', 'ben', 'zoe', 'other-stranger'].map((id) => authorOf(cloud, t, id));
    expect(distinctAuthors(list).map((a) => a.key)).toEqual(['me', 'ben', 'zoe', 'others']);
  });

  it('names followers who suggested a place, after members', () => {
    expect(authorOf(cloud, t, 'follower:abc', 'Mum')).toEqual({ key: 'follower:abc', name: 'Mum', color: FOLLOWER_COLOR });
    const list = ['stranger', 'follower:abc', 'zoe', 'me'].map((id) => authorOf(cloud, t, id, id.startsWith('follower:') ? 'Mum' : undefined));
    expect(distinctAuthors(list).map((a) => a.key)).toEqual(['me', 'zoe', 'follower:abc', 'others']);
  });
});
