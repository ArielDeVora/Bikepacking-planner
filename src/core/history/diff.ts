import type { Change } from '../commands';
import type { Entity, EntityType } from '../../model/types';

/**
 * The trip's history as a list of commits: what one action changed (only the fields that changed),
 * who did it and when. Restoring works by applying the "before" side of later commits.
 */

/** One entity in a commit. `before === null`: the commit created it. Absent fields are `null`. */
export interface ChangeDiff {
  id: string;
  type: EntityType;
  /** Its name at the time, for the list. */
  name?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export type CommitKind = 'edit' | 'undo' | 'redo' | 'restore';

export interface Commit {
  id: string;
  tripId: string;
  userId: string;
  /** Milliseconds since 1970. */
  at: number;
  label: string;
  kind: CommitKind;
  /** For a restore: the commit the trip was taken back to. */
  restoredTo?: string;
  changes: ChangeDiff[];
}

/** Bookkeeping fields, never part of a diff. */
const IGNORED = new Set(['updatedAt', 'updatedBy']);

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields that differ between two versions of an entity. */
export function diffChange(change: Change): ChangeDiff | null {
  const after = change.after as unknown as Record<string, unknown>;
  const name = typeof after.name === 'string' && after.name ? after.name : undefined;
  const base = { id: change.id, type: change.after.type, ...(name ? { name } : {}) };
  if (!change.before) {
    const full: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(after)) if (!IGNORED.has(k) && v !== undefined) full[k] = v;
    return { ...base, before: null, after: full };
  }
  const before = change.before as unknown as Record<string, unknown>;
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED.has(k) || same(before[k], after[k])) continue;
    b[k] = before[k] ?? null;
    a[k] = after[k] ?? null;
  }
  return Object.keys(a).length ? { ...base, before: b, after: a } : null;
}

/** Merges two consecutive diffs of the same entity into one (the first's before, the second's after). */
export function mergeDiffs(first: ChangeDiff, second: ChangeDiff): ChangeDiff | null {
  if (!first.before) return { ...second, before: null, after: { ...first.after, ...second.after } };
  const before = { ...second.before, ...first.before };
  const after = { ...first.after, ...second.after };
  for (const k of Object.keys(after)) {
    if (same(before[k], after[k])) {
      delete before[k];
      delete after[k];
    }
  }
  return Object.keys(after).length ? { ...second, before, after } : null;
}

/** An entity with these fields set (null removes a field). */
export function applyFields<E extends object>(entity: E, fields: Record<string, unknown>): E {
  const out = { ...entity } as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out as E;
}

/**
 * The changes that take the trip back to how it was right after `commits` stopped: the `later`
 * commits (oldest first) are undone, newest first. Entities they created are deleted.
 */
export function restoreChanges(later: Commit[], current: (id: string) => Entity | undefined): Change[] {
  const state = new Map<string, Entity>();
  for (const commit of [...later].reverse()) {
    for (const diff of [...commit.changes].reverse()) {
      const now = state.get(diff.id) ?? current(diff.id);
      if (!now) continue;
      state.set(diff.id, diff.before === null ? { ...now, deleted: true } : applyFields(now, diff.before));
    }
  }
  return [...state].flatMap(([id, after]) => {
    const before = current(id);
    if (!before || same(stripMeta(before), stripMeta(after))) return [];
    return [{ id, before, after }];
  });
}

/**
 * The changes that undo one commit, for the entities it touched that nobody has changed since.
 * `skipped` counts the others, left as they are.
 */
export function revertChanges(commit: Commit, current: (id: string) => Entity | undefined): { changes: Change[]; skipped: number } {
  const changes: Change[] = [];
  let skipped = 0;
  for (const diff of commit.changes) {
    const now = current(diff.id);
    if (!now) continue;
    const fields = now as unknown as Record<string, unknown>;
    const untouched = Object.entries(diff.after).every(([k, v]) => same(fields[k], v));
    if (!untouched) {
      skipped++;
      continue;
    }
    changes.push({ id: diff.id, before: now, after: diff.before === null ? { ...now, deleted: true } : applyFields(now, diff.before) });
  }
  return { changes, skipped };
}

function stripMeta(e: Entity): Record<string, unknown> {
  const { updatedAt: _a, updatedBy: _b, ...rest } = e;
  return rest;
}
