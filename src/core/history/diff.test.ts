import { describe, expect, it } from 'vitest';
import type { Change } from '../commands';
import type { Entity, Segment } from '../../model/types';
import { applyFields, diffChange, mergeDiffs, restoreChanges, revertChanges, type Commit } from './diff';

const seg = (over: Partial<Segment> = {}) =>
  ({ id: 's', type: 'segment', tripId: 't', stageId: 'a', order: 'V', name: 'One', notes: '', mode: 'bike', updatedAt: 1, updatedBy: 'u', deleted: false, ...over }) as Segment;
const change = (before: Entity | null, after: Entity): Change => ({ id: after.id, before, after });
const commit = (id: string, ...changes: Change[]): Commit => ({
  id,
  tripId: 't',
  userId: 'u',
  at: 0,
  label: id,
  kind: 'edit',
  changes: changes.map((c) => diffChange(c)!),
});

describe('history diffs', () => {
  it('keeps only the fields that changed, without bookkeeping', () => {
    const d = diffChange(change(seg(), seg({ name: 'Two', updatedAt: 9 })))!;
    expect(d).toMatchObject({ id: 's', type: 'segment', name: 'Two', before: { name: 'One' }, after: { name: 'Two' } });
    expect(diffChange(change(seg(), seg({ updatedAt: 5 })))).toBeNull();
  });

  it('records removed fields as null, and creations in full', () => {
    expect(diffChange(change(seg({ groupId: 'g' }), seg()))!.after).toEqual({ groupId: null });
    expect(diffChange(change(null, seg()))!).toMatchObject({ before: null, after: { name: 'One', mode: 'bike' } });
    expect(applyFields(seg({ groupId: 'g' }), { groupId: null }).groupId).toBeUndefined();
  });

  it('merges consecutive diffs and drops fields that came back', () => {
    const a = diffChange(change(seg(), seg({ name: 'Tw' })))!;
    const b = diffChange(change(seg({ name: 'Tw' }), seg({ name: 'Two', notes: 'x' })))!;
    expect(mergeDiffs(a, b)).toMatchObject({ before: { name: 'One', notes: '' }, after: { name: 'Two', notes: 'x' } });
    const back = diffChange(change(seg({ name: 'Two' }), seg()))!;
    expect(mergeDiffs(diffChange(change(seg(), seg({ name: 'Two' })))!, back)).toBeNull();
  });

  it('restores the trip to a point by undoing later commits, newest first', () => {
    const created = seg({ id: 'n', name: 'New' });
    const later = [commit('c2', change(seg(), seg({ name: 'Two' }))), commit('c3', change(null, created), change(seg({ name: 'Two' }), seg({ name: 'Three', notes: 'x' })))];
    const current = new Map<string, Entity>([
      ['s', seg({ name: 'Three', notes: 'x' })],
      ['n', created],
    ]);
    const changes = restoreChanges(later, (id) => current.get(id));
    const byId = new Map(changes.map((c) => [c.id, c.after as Segment]));
    expect(byId.get('s')).toMatchObject({ name: 'One', notes: '' });
    expect(byId.get('n')!.deleted).toBe(true);
  });

  it('undoes one commit, leaving alone what was changed since', () => {
    const c = commit('c', change(seg(), seg({ name: 'Two' })), change(seg({ id: 'o' }), seg({ id: 'o', notes: 'n' })));
    const current = new Map<string, Entity>([
      ['s', seg({ name: 'Edited again' })],
      ['o', seg({ id: 'o', notes: 'n' })],
    ]);
    const res = revertChanges(c, (id) => current.get(id));
    expect(res.skipped).toBe(1);
    expect(res.changes.map((x) => [x.id, (x.after as Segment).notes])).toEqual([['o', '']]);
  });
});

describe('history of drawn segments', () => {
  const pt = (x: number) => ({ id: `a${x}`, lngLat: [x, 0] as [number, number] });
  const leg = (line: string, status?: 'pending') => ({ line, ...(status ? { status } : {}) });
  const routed = (anchors: ReturnType<typeof pt>[], legs: { line: string; status?: 'pending' }[]) =>
    seg({ geomType: 'routed', anchors, legs, stats: { lengthM: 1, ascentM: 0, descentM: 0 } } as Partial<Segment>);

  it('leaves out lines and distances, which come back from the points', () => {
    const d = diffChange(change(routed([pt(0), pt(1)], [leg('ROUTED01')]), routed([pt(0), pt(2)], [leg('ROUTED02')])))!;
    expect(Object.keys(d.after)).toEqual(['anchors']);
    expect(Object.keys(diffChange(change(null, routed([pt(0), pt(1)], [leg('X')])))!.after)).not.toContain('legs');
  });

  it('keeps an imported track’s lines', () => {
    const imported = (line: string) => seg({ geomType: 'imported', anchors: [pt(0), pt(1)], legs: [leg(line)] } as Partial<Segment>);
    expect(diffChange(change(imported('A'), imported('B')))!.after).toHaveProperty('legs');
  });

  it('redraws lines on undo, keeping the routing of legs that didn’t change', () => {
    const before = routed([pt(0), pt(1), pt(2)], [leg('KEEP'), leg('OLD')]);
    const after = routed([pt(0), pt(1), pt(3)], [leg('KEEP'), leg('NEW')]);
    const c = commit('c1', change(before, after));
    const { changes } = revertChanges(c, () => after);
    const restored = changes[0]!.after as Segment;
    expect(restored.anchors.map((a) => a.lngLat[0])).toEqual([0, 1, 2]);
    expect(restored.legs[0]!.line).toBe('KEEP');
    expect(restored.legs[1]!.status).toBe('pending');
  });
});
