import type { Comment, Entity } from '../../model/types';

export interface PersonActivity {
  userId: string;
  /** Items added, changed or deleted (comments and votes counted apart). */
  edits: number;
  comments: number;
  votes: number;
}

export interface SinceSummary {
  people: PersonActivity[];
  /** Comments by others that mention me, newest first. */
  mentions: Comment[];
  /** Most recently changed item by someone else, to jump to. */
  latest: Entity | null;
}

/** What others did to the trip after `since` (each item counts once: its latest change). */
export function sinceLastVisit(entities: Entity[], since: number, isMine: (id: string) => boolean): SinceSummary {
  const byPerson = new Map<string, PersonActivity>();
  const mentions: Comment[] = [];
  let latest: Entity | null = null;
  for (const e of entities) {
    if (e.updatedAt <= since || !e.updatedBy || isMine(e.updatedBy)) continue;
    let p = byPerson.get(e.updatedBy);
    if (!p) byPerson.set(e.updatedBy, (p = { userId: e.updatedBy, edits: 0, comments: 0, votes: 0 }));
    if (e.type === 'comment') {
      if (e.deleted) continue;
      p.comments++;
      if (e.mentions?.some(isMine)) mentions.push(e);
    } else if (e.type === 'vote') p.votes++;
    else {
      p.edits++;
      if (!e.deleted && e.type !== 'trip' && (!latest || e.updatedAt > latest.updatedAt)) latest = e;
    }
  }
  const people = [...byPerson.values()]
    .filter((p) => p.edits + p.comments + p.votes > 0)
    .sort((a, b) => b.edits + b.comments + b.votes - (a.edits + a.comments + a.votes));
  mentions.sort((a, b) => b.createdAt - a.createdAt);
  return { people, mentions, latest };
}

export const isEmpty = (s: SinceSummary) => !s.people.length && !s.mentions.length;
