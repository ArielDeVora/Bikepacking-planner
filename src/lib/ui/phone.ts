import { readable } from 'svelte/store';

/** Narrow screens get the phone layout: full-screen map and bottom sheets. Keep in sync with the CSS. */
export const PHONE_QUERY = '(max-width: 640px)';

const matches = (query: string): boolean => typeof matchMedia === 'function' && matchMedia(query).matches;

export const isPhone = (): boolean => matches(PHONE_QUERY);

/** Fingers rather than a mouse: bigger hit areas on the map. */
export const isCoarse = (): boolean => matches('(pointer: coarse)');

export const phone = readable(isPhone(), (set) => {
  if (typeof matchMedia !== 'function') return;
  const mq = matchMedia(PHONE_QUERY);
  const update = () => set(mq.matches);
  update();
  mq.addEventListener('change', update);
  return () => mq.removeEventListener('change', update);
});
