import { writable, type Readable } from 'svelte/store';
import type { Settings } from './settings';

export type Theme = 'light' | 'dark';
/** A fixed theme, or following the system's. */
export type ThemeMode = Theme | 'system';

export interface ThemeController extends Readable<Theme> {
  readonly mode: Readable<ThemeMode>;
  toggle(): void;
  setMode(mode: ThemeMode): void;
}

export function createTheme(settings: Settings): ThemeController {
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const system = (): Theme => (media?.matches ? 'dark' : 'light');
  const saved = settings.get<Theme | null>('theme', null);
  const mode = writable<ThemeMode>(saved ?? 'system');
  const theme = writable<Theme>(saved ?? system());
  let current: ThemeMode = saved ?? 'system';

  theme.subscribe((value) => {
    document.documentElement.dataset.theme = value;
  });
  media?.addEventListener('change', () => {
    if (current === 'system') theme.set(system());
  });

  function setMode(next: ThemeMode) {
    current = next;
    mode.set(next);
    settings.set('theme', next === 'system' ? undefined : next);
    theme.set(next === 'system' ? system() : next);
  }

  return {
    subscribe: theme.subscribe,
    mode: { subscribe: mode.subscribe },
    toggle() {
      const shown = current === 'system' ? system() : current;
      setMode(shown === 'dark' ? 'light' : 'dark');
    },
    setMode,
  };
}
