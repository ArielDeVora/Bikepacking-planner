import { describe, expect, it } from 'vitest';
import { stage } from '../../test/fixtures';
import { canonical, entityToRow, rowToEntity, sameContent } from './rows';

describe('entity rows', () => {
  it('round-trips entities through rows', () => {
    const s = stage('s1', 'V', { color: '#fff', updatedAt: Date.parse('2027-03-01T10:00:00.000Z'), updatedBy: 'u1' });
    const row = entityToRow(s);
    expect(row).toEqual({ id: 's1', trip_id: s.tripId, type: 'stage', deleted: false, data: { order: 'V', name: 's1', notes: '', color: '#fff' } });
    expect(rowToEntity({ ...row, updated_at: '2027-03-01T10:00:00.000Z', updated_by: 'u1' })).toEqual(s);
  });

  it('drops undefined fields', () => {
    expect('color' in entityToRow(stage('s1', 'V', { color: undefined })).data).toBe(false);
  });

  it('compares content regardless of key order and stamps', () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
    const a = stage('s1', 'V', { updatedBy: 'u1', updatedAt: 1 });
    const reordered = { ...Object.fromEntries(Object.entries(a).reverse()), updatedBy: 'u2', updatedAt: 2 } as typeof a;
    expect(sameContent(a, reordered)).toBe(true);
    expect(sameContent(a, { ...a, name: 'x' })).toBe(false);
    expect(sameContent(a, { ...a, deleted: true })).toBe(false);
  });
});
