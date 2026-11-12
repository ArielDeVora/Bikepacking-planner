import { editedAt, editedBy } from '../../model/edited';
import type { Entity } from '../../model/types';

export type BadgeId = 'scout' | 'goat' | 'cartographer' | 'climber' | 'quartermaster' | 'chatterbox' | 'critic' | 'borderGuard' | 'nightOwl';

export interface BadgeDef {
  id: BadgeId;
  emoji: string;
}

/** In the order they're shown. */
export const BADGES: BadgeDef[] = [
  { id: 'scout', emoji: '🧭' },
  { id: 'goat', emoji: '🐐' },
  { id: 'cartographer', emoji: '🗺️' },
  { id: 'climber', emoji: '🏔️' },
  { id: 'quartermaster', emoji: '🎒' },
  { id: 'chatterbox', emoji: '💬' },
  { id: 'critic', emoji: '🗳️' },
  { id: 'borderGuard', emoji: '🛂' },
  { id: 'nightOwl', emoji: '🦉' },
];

export interface Award {
  badge: BadgeDef;
  /** The count it was won with (places, votes, km, metres…). */
  value: number;
}

/** Edits between midnight and 5 am (local time) needed for the night owl. */
const NIGHT_OWL_MIN = 5;

/**
 * Each member's badges: the member with the highest count for a badge wins it (all of them on
 * a tie), if it's above zero. `who` turns any user id into a member id (or null for others).
 */
export function computeBadges(entities: Entity[], who: (userId: string | undefined) => string | null): Map<string, Award[]> {
  const counts = new Map<BadgeId, Map<string, number>>(BADGES.map((b) => [b.id, new Map()]));
  const add = (badge: BadgeId, userId: string | undefined, n = 1) => {
    const id = who(userId);
    if (!id || !n) return;
    const m = counts.get(badge)!;
    m.set(id, (m.get(id) ?? 0) + n);
  };
  const live = entities.filter((e) => !e.deleted);
  const poiAuthor = new Map(live.flatMap((e) => (e.type === 'poi' ? [[e.id, e.createdBy] as const] : [])));

  for (const e of live) {
    switch (e.type) {
      case 'poi':
        add('scout', e.createdBy);
        break;
      case 'vote': {
        add('critic', e.userId);
        const author = poiAuthor.get(e.poiId);
        if (e.value === 2 && author && who(author) !== who(e.userId)) add('goat', author);
        break;
      }
      case 'segment': {
        const maker = e.createdBy ?? editedBy(e);
        add('cartographer', maker, Math.round(e.stats.lengthM / 1000));
        add('climber', maker, Math.round(e.stats.ascentM));
        break;
      }
      case 'gear':
        if (e.status !== 'needed') add('quartermaster', e.boughtBy);
        break;
      case 'comment':
        add('chatterbox', e.authorId);
        break;
      case 'borderCrossing':
        add('borderGuard', e.createdBy ?? editedBy(e));
        break;
    }
    if (e.editedAt !== undefined && new Date(editedAt(e)).getHours() < 5) add('nightOwl', editedBy(e));
  }

  const out = new Map<string, Award[]>();
  for (const badge of BADGES) {
    const m = counts.get(badge.id)!;
    const best = Math.max(0, ...m.values());
    const min = badge.id === 'nightOwl' ? NIGHT_OWL_MIN : 1;
    if (best < min) continue;
    for (const [id, n] of m) if (n === best) out.set(id, [...(out.get(id) ?? []), { badge, value: n }]);
  }
  return out;
}
