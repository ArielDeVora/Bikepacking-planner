import { derived, type Readable } from 'svelte/store';
import type { ModuleContext } from '../../core/module';
import { computeBadges, type Award } from './badges';

/** Each member's badges, kept up to date with the trip and its members. */
export function badgeStore(ctx: ModuleContext): Readable<Map<string, Award[]>> {
  const { store, cloud } = ctx;
  const changes: Readable<number> = { subscribe: (run) => store.subscribe(run) };
  return derived([changes, cloud.members], ([, members]) => {
    const ids = new Set(members.map((m) => m.id));
    const mine = members.find((m) => cloud.isMine(m.id))?.id ?? null;
    const who = (id: string | undefined) => (!id ? null : ids.has(id) ? id : cloud.isMine(id) ? mine : null);
    return computeBadges(store.all(), who);
  });
}
