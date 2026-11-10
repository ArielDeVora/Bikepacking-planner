import type { ChangeDiff, Commit } from '../../core/history/diff';

/** Field groups shown in the history, in plain words (the key of a string in i18n). */
const FIELD_GROUPS: [string, string[]][] = [
  ['route', ['anchors', 'legs', 'stats', 'geomType', 'profile', 'snap', 'lngLat', 'polygon', 'ring']],
  ['name', ['name']],
  ['notes', ['notes', 'body']],
  ['style', ['color', 'lineWidth', 'dash']],
  ['mode', ['mode']],
  ['date', ['plannedDate']],
  ['position', ['order', 'stageId', 'groupId', 'routeId']],
];

export type Verb = 'created' | 'deleted' | 'restored' | 'changed';

export interface ChangeSummary {
  verb: Verb;
  /** i18n keys of the field groups that changed (for "changed"). */
  fields: string[];
}

export function summarize(diff: ChangeDiff): ChangeSummary {
  if (diff.before === null) return { verb: 'created', fields: [] };
  if (diff.after.deleted === true) return { verb: 'deleted', fields: [] };
  if (diff.after.deleted === false) return { verb: 'restored', fields: [] };
  const keys = Object.keys(diff.after);
  const fields = FIELD_GROUPS.filter(([, ks]) => ks.some((k) => keys.includes(k))).map(([g]) => g);
  const known = new Set(FIELD_GROUPS.flatMap(([, ks]) => ks));
  if (keys.some((k) => !known.has(k))) fields.push('other');
  return { verb: 'changed', fields };
}

/** Lanes for the timeline: one per person, in the order they first appear (newest first). */
export function lanes(commits: Commit[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of commits) if (!out.has(c.userId)) out.set(c.userId, out.size);
  return out;
}

/** Commits that touch this entity. */
export const touching = (commits: Commit[], id: string) => commits.filter((c) => c.changes.some((d) => d.id === id));
