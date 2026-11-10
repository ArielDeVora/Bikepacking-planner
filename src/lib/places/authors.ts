import type { t as translate } from '../../core/i18n';
import type { Profile } from '../../core/cloud/cloud';

/** Who added a place, as shown in the Places list, the place card and on the map. */
export interface Author {
  /** 'me', a member's id, or 'others' for people who aren't members (or not any more). */
  key: string;
  name: string;
  color: string;
}

export const OTHERS_COLOR = '#868e96';
export const MY_DEFAULT_COLOR = '#d9480f';

export interface AuthorLookup {
  isMine(id: string): boolean;
  profileOf(id: string): Profile | undefined;
}

export function authorOf(cloud: AuthorLookup, t: typeof translate, createdBy: string): Author {
  if (cloud.isMine(createdBy)) {
    return { key: 'me', name: t('poi.byYou'), color: cloud.profileOf(createdBy)?.color ?? MY_DEFAULT_COLOR };
  }
  const p = cloud.profileOf(createdBy);
  if (p) return { key: p.id, name: p.name || t('collab.someone'), color: p.color };
  return { key: 'others', name: t('poi.bySomeoneElse'), color: OTHERS_COLOR };
}

/** The distinct authors of some places: you first, then members by name, then everyone else. */
export function distinctAuthors(authors: Author[]): Author[] {
  const byKey = new Map(authors.map((a) => [a.key, a]));
  const rank = (a: Author) => (a.key === 'me' ? 0 : a.key === 'others' ? 2 : 1);
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
