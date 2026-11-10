import { edits, type Change, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import type { Vote, VoteValue } from '../../model/types';

/** The votes, best first. */
export const VOTES: { value: Exclude<VoteValue, 0>; emoji: string; key: 'vote.goated' | 'vote.yes' | 'vote.no' }[] = [
  { value: 2, emoji: '🐐', key: 'vote.goated' },
  { value: 1, emoji: '👍', key: 'vote.yes' },
  { value: -1, emoji: '👎', key: 'vote.no' },
];

/**
 * A fixed UUID for one person's vote on one place, so the same person voting from two devices
 * updates one vote instead of adding a second. Not cryptographic: four 32-bit FNV-1a hashes.
 */
export function voteId(poiId: string, userId: string): string {
  const input = `vote:${poiId}:${userId}`;
  let hex = '';
  for (let seed = 0; seed < 4; seed++) {
    let h = (0x811c9dc5 ^ (seed * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex += h.toString(16).padStart(8, '0');
  }
  // Shaped as a version 8 (custom) UUID.
  const v = `8${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v}-${variant}-${hex.slice(20, 32)}`;
}

/** Votes cast on each place (taken-back votes left out). */
export function votesByPlace(store: TripStore): Map<string, Vote[]> {
  const map = new Map<string, Vote[]>();
  for (const v of store.list('vote', (v) => v.value !== 0)) {
    const list = map.get(v.poiId);
    if (list) list.push(v);
    else map.set(v.poiId, [v]);
  }
  return map;
}

export interface Tally {
  /** GOATED counts 2, yes 1, not for me −1. */
  score: number;
  counts: Record<-1 | 1 | 2, number>;
}

export function tally(votes: readonly Vote[]): Tally {
  const counts = { [-1]: 0, 1: 0, 2: 0 } as Record<-1 | 1 | 2, number>;
  let score = 0;
  for (const v of votes) {
    if (v.value === 0) continue;
    counts[v.value]++;
    score += v.value;
  }
  return { score, counts };
}

/**
 * Sets the user's vote on a place (0 takes it back). Votes the same person cast under another id
 * of theirs (before signing in) are taken back too, so they count once.
 */
export function voteCommand(
  store: TripStore,
  opts: { tripId: string; poiId: string; userId: string; value: VoteValue; label: string; isMine?: (id: string) => boolean },
): Command | null {
  const changes: Change[] = [];
  const id = voteId(opts.poiId, opts.userId);
  const existing = store.getRaw(id);
  if (existing?.type === 'vote') {
    if (existing.value !== opts.value || existing.deleted) changes.push(edits.update<Vote>(store, id, { value: opts.value, deleted: false }));
  } else if (opts.value !== 0) {
    changes.push(edits.create<Vote>({ id, type: 'vote', tripId: opts.tripId, poiId: opts.poiId, userId: opts.userId, value: opts.value }));
  }
  if (opts.isMine) {
    for (const v of store.list('vote', (v) => v.poiId === opts.poiId && v.id !== id && v.value !== 0 && opts.isMine!(v.userId))) {
      changes.push(edits.update<Vote>(store, v.id, { value: 0 }));
    }
  }
  return changes.length ? { label: opts.label, changes } : null;
}
