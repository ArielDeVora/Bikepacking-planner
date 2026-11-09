import type { t as translate } from '../core/i18n';

export function timeAgo(t: typeof translate, then: number, now = Date.now()): string {
  const min = Math.floor((now - then) / 60_000);
  if (min < 1) return t('collab.justNow');
  if (min < 60) return t('collab.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('collab.hoursAgo', { n: h });
  return t('collab.daysAgo', { n: Math.floor(h / 24) });
}
