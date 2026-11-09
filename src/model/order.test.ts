import { describe, expect, it } from 'vitest';
import { compareOrder, keyBetween } from './order';

describe('keyBetween', () => {
  it('creates a first key', () => {
    expect(keyBetween(null, null)).toBe('V');
  });

  it('returns keys strictly between the bounds', () => {
    const cases: [string | null, string | null][] = [
      [null, 'V'],
      ['V', null],
      ['V', 'W'],
      ['a', 'a1'],
      ['z', null],
      [null, '01'],
      ['Vz', 'W'],
    ];
    for (const [a, b] of cases) {
      const k = keyBetween(a, b);
      if (a !== null) expect(k > a).toBe(true);
      if (b !== null) expect(k < b).toBe(true);
      expect(k.endsWith('0')).toBe(false);
    }
  });

  it('keeps ordering under repeated inserts at the same spot', () => {
    let lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    const keys = [lo, hi];
    for (let i = 0; i < 200; i++) {
      lo = keyBetween(lo, hi);
      keys.push(lo);
    }
    const sorted = [...keys].sort();
    expect(new Set(keys).size).toBe(keys.length);
    expect(sorted.at(-1)).toBe(hi);
  });

  it('keeps ordering when prepending and appending many times', () => {
    const keys = [keyBetween(null, null)];
    for (let i = 0; i < 100; i++) {
      keys.unshift(keyBetween(null, keys[0]!));
      keys.push(keyBetween(keys.at(-1)!, null));
    }
    expect([...keys].sort()).toEqual(keys);
  });

  it('rejects invalid bounds', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
  });
});

describe('compareOrder', () => {
  it('breaks ties by id', () => {
    const items = [
      { order: 'V', id: 'b' },
      { order: 'V', id: 'a' },
      { order: 'A', id: 'z' },
    ];
    expect(items.sort(compareOrder).map((i) => i.id)).toEqual(['z', 'a', 'b']);
  });
});
