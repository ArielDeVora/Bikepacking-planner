import { describe, expect, it } from 'vitest';
import { RELEASES } from './releases';

describe('release notes', () => {
  it('have unique ids, newest first, each with something to say', () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids);
    for (const r of RELEASES) {
      expect(r.id).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
      expect(r.title).not.toBe('');
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
});
