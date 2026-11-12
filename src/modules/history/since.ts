import { editedAt, editedBy } from '../../model/edited';
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
  /** Places suggested through follow links: how many per follower's name. */
  suggestions: { name: string; count: number }[];
}

/** What others did to the trip after `since` (each item counts once: its latest change). */
export function sinceLastVisit(entities: Entity[], since: number, isMine: (id: string) => boolean): SinceSummary {
  const byPerson = new Map<string, PersonActivity>();
  const mentions: Comment[] = [];
  let latest: Entity | null = null;
  const suggested = new Map<string, number>();
  for (const e of entities) {
    if (e.type === 'poi' && e.followerId && !e.deleted && e.updatedAt > since && e.createdBy.startsWith('follower:') && !e.editedBy) {
      const name = e.suggestedBy ?? '';
      suggested.set(name, (suggested.get(name) ?? 0) + 1);
      if (!latest || e.updatedAt > editedAt(latest)) latest = e;
      continue;
    }
    const by = editedBy(e);
    if (editedAt(e) <= since || !by || isMine(by)) continue;
    let p = byPerson.get(by);
    if (!p) byPerson.set(by, (p = { userId: by, edits: 0, comments: 0, votes: 0 }));
    if (e.type === 'comment') {
      if (e.deleted) continue;
      p.comments++;
      if (e.mentions?.some(isMine)) mentions.push(e);
    } else if (e.type === 'vote') p.votes++;
    else {
      p.edits++;
      if (!e.deleted && e.type !== 'trip' && (!latest || editedAt(e) > editedAt(latest))) latest = e;
    }
  }
  const people = [...byPerson.values()]
    .filter((p) => p.edits + p.comments + p.votes > 0)
    .sort((a, b) => b.edits + b.comments + b.votes - (a.edits + a.comments + a.votes));
  mentions.sort((a, b) => b.createdAt - a.createdAt);
  const suggestions = [...suggested].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { people, mentions, latest, suggestions };
}

export const isEmpty = (s: SinceSummary) => !s.people.length && !s.mentions.length && !s.suggestions.length;
