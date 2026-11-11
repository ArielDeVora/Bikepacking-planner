import { get } from 'svelte/store';
import type { Core } from '../core/core';
import { createSettings } from '../core/settings';
import { RELEASES, type Release } from '../config/releases';
import Guide from './Guide.svelte';
import WhatsNew from './WhatsNew.svelte';

const prefs = createSettings('onboarding');
/** How many releases the What's new window shows when opened by hand (the rest are behind a link). */
const RECENT = 3;
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Releases to show: every one newer than the last one seen. Someone who used the app before this
 * window existed (nothing seen yet) gets them all; a first visit gets none.
 */
export function pendingReleases(releases: Release[], seen: string | null, returning: boolean): Release[] {
  if (seen === null) return returning ? releases : [];
  return releases.filter((r) => r.id > seen);
}

export const markSeen = () => prefs.set('seenRelease', RELEASES[0]?.id ?? null);

/** `unseen`: the releases missed since the last visit; none when opened by hand (the latest few are shown). */
export const openWhatsNew = (core: Core, unseen: Release[] = []) =>
  core.ui.openDialog(WhatsNew, { core, releases: unseen.length ? unseen : RELEASES.slice(0, RECENT), unseen: unseen.length, all: RELEASES });

export const openGuide = (core: Core) => core.ui.openDialog(Guide, { core });

/** Once the app is ready: the guide on a first visit, What's new after an update (unless turned off in Settings). */
export function startOnboarding(core: Core): void {
  if (core.readOnly) return;
  const seen = prefs.get<string | null>('seenRelease', null);
  if (seen === (RELEASES[0]?.id ?? null) || get(core.ui.dialog)) return;
  const pending = pendingReleases(RELEASES, seen, !core.firstVisit);
  if (pending.length) {
    if (core.prefs.current.whatsNew) openWhatsNew(core, pending);
  } else if (seen === null) openGuide(core);
  markSeen();
}

/**
 * Checks now and then whether a newer build has been deployed, and offers to reload. Only in a
 * production build (version.json is written by the build).
 */
export function watchForUpdates(core: Core): () => void {
  if (import.meta.env.DEV || __APP_BUILD__ === 'dev') return () => {};
  let told = false;
  const check = async () => {
    if (told || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = (await res.json()) as { build?: string };
      if (!build || build === __APP_BUILD__) return;
      told = true;
      core.ui.notify(core.t('update.available'), 'info', 0, { label: core.t('update.reload'), run: () => location.reload() });
    } catch {
      /* offline: try again later */
    }
  };
  const timer = setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', check);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
  };
}
