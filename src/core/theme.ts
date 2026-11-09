import { writable, type Readable } from 'svelte/store';
import type { Settings } from './settings';

export type Theme = 'light' | 'dark';

export interface ThemeController extends Readable<Theme> {
  toggle(): void;
}

export function createTheme(settings: Settings): ThemeController {
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const saved = settings.get<Theme | null>('theme', null);
  const theme = writable<Theme>(saved ?? (media?.matches ? 'dark' : 'light'));
  let explicit = saved !== null;

  theme.subscribe((value) => {
    document.documentElement.dataset.theme = value;
  });
  media?.addEventListener('change', (e) => {
    if (!explicit) theme.set(e.matches ? 'dark' : 'light');
  });

  return {
    subscribe: theme.subscribe,
    toggle() {
      explicit = true;
      theme.update((value) => {
        const next = value === 'dark' ? 'light' : 'dark';
        settings.set('theme', next);
        return next;
      });
    },
  };
}
