import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { Settings } from './settings';
import { Visibility } from './visibility';

function memorySettings(): Settings {
  const data = new Map<string, unknown>();
  return { get: <T>(k: string, fallback: T) => (data.has(k) ? (data.get(k) as T) : fallback), set: (k: string, v: unknown) => void data.set(k, v) } as Settings;
}

describe('Visibility', () => {
  it('hides and shows, per trip, and remembers it', () => {
    const settings = memorySettings();
    let trip = 't1';
    const v = new Visibility(settings, () => trip);
    v.toggle('a');
    v.set(['b', 'c'], true);
    v.set(['c'], false);
    expect([...get(v.hidden)]).toEqual(['a', 'b']);

    const again = new Visibility(settings, () => trip);
    again.load();
    expect(again.isHidden('b')).toBe(true);

    trip = 't2';
    again.load();
    expect(get(again.hidden).size).toBe(0);
    trip = 't1';
    again.load();
    again.showAll();
    expect(get(again.hidden).size).toBe(0);
  });
});
