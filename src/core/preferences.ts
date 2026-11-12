import { get, writable, type Readable } from 'svelte/store';
import type { Settings } from './settings';

export type PlaceNames = 'always' | 'zoomed' | 'never';

/** App-wide preferences, kept in this browser. */
export interface Preferences {
  /** Size of your places on the map (1 = normal). */
  placeSize: number;
  /** Size of OpenStreetMap places (overlays) on the map. */
  osmPlaceSize: number;
  placeNames: PlaceNames;
  /** On shared trips, a dot in the colour of whoever added each place. */
  placeAuthors: boolean;
  /** Multiplies the width of every route line. */
  routeWidth: number;
  /** Routing profile for new bike segments; null for the routing service's default. */
  bikeProfile: string | null;
  /** Opens "What's new" after an update. */
  whatsNew: boolean;
  /** Tighter rows in the side panel. */
  compactPanel: boolean;
  /** A notice after each change, with a button to undo it. */
  undoNotices: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  placeSize: 1,
  osmPlaceSize: 1,
  placeNames: 'zoomed',
  placeAuthors: true,
  routeWidth: 1,
  bikeProfile: null,
  whatsNew: true,
  compactPanel: false,
  undoNotices: true,
};

/** Zoom level from which place names show when `placeNames` is 'zoomed'. */
export const PLACE_NAMES_ZOOM = 11;

export interface PreferenceStore extends Readable<Preferences> {
  readonly current: Preferences;
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  reset(): void;
  /** Calls `run` with the value of one preference now and whenever it changes. */
  watch<K extends keyof Preferences>(key: K, run: (value: Preferences[K]) => void): () => void;
}

export function createPreferences(settings: Settings): PreferenceStore {
  const saved = settings.get<Record<string, unknown>>('values', {});
  const known = Object.fromEntries(Object.entries(saved ?? {}).filter(([k, v]) => isValid(k, v)));
  const store = writable<Preferences>({ ...DEFAULT_PREFERENCES, ...known });
  const save = (value: Preferences) => {
    const changed = Object.fromEntries(
      Object.entries(value).filter(([k, v]) => v !== DEFAULT_PREFERENCES[k as keyof Preferences]),
    );
    settings.set('values', Object.keys(changed).length ? changed : undefined);
  };

  return {
    subscribe: store.subscribe,
    get current() {
      return get(store);
    },
    set(key, value) {
      store.update((p) => {
        const next = { ...p, [key]: value };
        save(next);
        return next;
      });
    },
    reset() {
      store.set({ ...DEFAULT_PREFERENCES });
      save(DEFAULT_PREFERENCES);
    },
    watch(key, run) {
      let last: unknown = Symbol();
      return store.subscribe((p) => {
        if (p[key] === last) return;
        last = p[key];
        run(p[key]);
      });
    },
  };
}

/** Ignores stored values from older versions or with the wrong type. */
function isValid(key: string, value: unknown): boolean {
  if (!(key in DEFAULT_PREFERENCES)) return false;
  if (key === 'bikeProfile') return value === null || typeof value === 'string';
  if (key === 'placeNames') return value === 'always' || value === 'zoomed' || value === 'never';
  return typeof value === typeof DEFAULT_PREFERENCES[key as keyof Preferences];
}
