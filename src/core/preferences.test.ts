import { describe, expect, it } from 'vitest';
import { createPreferences, DEFAULT_PREFERENCES } from './preferences';
import type { Settings } from './settings';

function memorySettings(initial: Record<string, unknown> = {}): Settings & { data: Map<string, unknown> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: <T>(k: string, fallback: T) => (data.has(k) ? (data.get(k) as T) : fallback),
    set: (k: string, v: unknown) => void (v === undefined ? data.delete(k) : data.set(k, v)),
  };
}

describe('preferences', () => {
  it('starts from the defaults and stores only what differs from them', () => {
    const settings = memorySettings();
    const prefs = createPreferences(settings);
    expect(prefs.current).toEqual(DEFAULT_PREFERENCES);
    prefs.set('placeSize', 1.4);
    prefs.set('placeNames', 'always');
    expect(settings.data.get('values')).toEqual({ placeSize: 1.4, placeNames: 'always' });
    prefs.set('placeSize', 1);
    expect(settings.data.get('values')).toEqual({ placeNames: 'always' });
    expect(createPreferences(settings).current.placeNames).toBe('always');
  });

  it('ignores unknown keys and values of the wrong type', () => {
    const prefs = createPreferences(
      memorySettings({ values: { placeSize: 'big', placeNames: 'sometimes', routeWidth: 2, bikeProfile: 'gravel', old: 1 } }),
    );
    expect(prefs.current).toEqual({ ...DEFAULT_PREFERENCES, routeWidth: 2, bikeProfile: 'gravel' });
  });

  it('resets to the defaults', () => {
    const settings = memorySettings();
    const prefs = createPreferences(settings);
    prefs.set('whatsNew', false);
    prefs.reset();
    expect(prefs.current).toEqual(DEFAULT_PREFERENCES);
    expect(settings.data.has('values')).toBe(false);
  });

  it('watches one preference: now, then only when it changes', () => {
    const prefs = createPreferences(memorySettings());
    const seen: number[] = [];
    const off = prefs.watch('routeWidth', (w) => seen.push(w));
    prefs.set('placeSize', 1.2);
    prefs.set('routeWidth', 2);
    prefs.set('routeWidth', 2);
    off();
    prefs.set('routeWidth', 3);
    expect(seen).toEqual([1, 2]);
  });
});
