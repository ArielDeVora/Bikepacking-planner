import { describe, expect, it } from 'vitest';
import { CountryIndex } from '../../lib/countries';
import { encodeLine } from '../../lib/geo/polyline';
import type { Segment } from '../../model/types';
import { planRows, RouteLine } from './rows';

const seg = (id: string, coords: [number, number][], km: number, mode: Segment['mode'] = 'bike'): Segment =>
  ({ id, stageId: 's1', name: id, mode, legs: [{ line: encodeLine(coords) }], stats: { lengthM: km * 1000, ascentM: 0, descentM: 0 } }) as unknown as Segment;

// Two "countries" split at longitude 10.
const square = (code: string, w: number, e: number) => ({
  code,
  name: code,
  polygons: [{ bbox: [w, 40, e, 50] as [number, number, number, number], rings: [[[w, 40], [e, 40], [e, 50], [w, 50], [w, 40]] as [number, number][]] }],
});
const countries = new CountryIndex([square('AA', 0, 10), square('BB', 10, 20)]);

describe('route geometry and calendar rows', () => {
  it('finds positions by distance along the route, across segments', () => {
    const line = new RouteLine([seg('a', [[0, 45], [2, 45]], 100), seg('b', [[2, 45], [4, 45]], 100)]);
    expect(line.ranges.get('b')).toEqual({ from: 100, to: 200 });
    expect(line.pointAt(50)![0]).toBeCloseTo(1, 1);
    expect(line.pointAt(150)![0]).toBeCloseTo(3, 1);
    expect(line.pointAt(999)).toEqual([4, 45]);
  });

  it('splits a bike segment by the countries it crosses', () => {
    const segments = [seg('a', [[5, 45], [15, 45]], 800)];
    const rows = planRows(segments, new RouteLine(segments), countries);
    expect(rows.map((r) => [r.country?.code, Math.round(r.fromKm), Math.round(r.toKm)])).toEqual([
      ['AA', 0, 400],
      ['BB', 400, 800],
    ]);
    expect(rows[0]!.mid![0]).toBeCloseTo(7.5, 0);
  });

  it('keeps a motorised journey in one row, with the country it arrives in', () => {
    const segments = [seg('t', [[5, 45], [15, 45]], 800, 'train')];
    const rows = planRows(segments, new RouteLine(segments), countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.country?.code).toBe('BB');
  });

  it('has one row per segment without country outlines', () => {
    const segments = [seg('a', [[5, 45], [15, 45]], 800)];
    expect(planRows(segments, new RouteLine(segments), null)).toHaveLength(1);
  });
});
