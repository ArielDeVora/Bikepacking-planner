import { describe, expect, it } from 'vitest';
import { CountryIndex } from '../../lib/countries';
import { findCrossings } from './countries';

// Two side-by-side "countries" split at longitude 7, and a third across a strait at lat 46.
const index = CountryIndex.fromGeoJSON({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ISO_A2: 'FR', NAME_EN: 'France' }, geometry: { type: 'Polygon', coordinates: [[[5, 44], [7, 44], [7, 45.9], [5, 45.9], [5, 44]]] } },
    { type: 'Feature', properties: { ISO_A2: '-99', ADM0_A3: 'ITA', NAME_EN: 'Italy' }, geometry: { type: 'MultiPolygon', coordinates: [[[[7, 44], [9, 44], [9, 45.9], [7, 45.9], [7, 44]]]] } },
    { type: 'Feature', properties: { ISO_A2: 'CH', NAME_EN: 'Switzerland' }, geometry: { type: 'Polygon', coordinates: [[[5, 46.1], [9, 46.1], [9, 47], [5, 47], [5, 46.1]]] } },
  ],
});

const line = (from: [number, number], to: [number, number], n = 200): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);

describe('border crossings', () => {
  it('finds countries', () => {
    expect(index.at([6, 45])!.name).toBe('France');
    expect(index.at([8, 45])!.code).toBe('ITA');
    expect(index.at([6, 46])).toBeNull();
  });

  it('finds where a ground route changes country, to within ~150 m', () => {
    const crossings = findCrossings(index, [{ segmentId: 's1', endsOnly: false, coords: line([6, 45], [8, 45]) }]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.from.name).toBe('France');
    expect(crossings[0]!.to.name).toBe('Italy');
    expect(Math.abs(crossings[0]!.lngLat[0] - 7)).toBeLessThan(0.003);
    expect(crossings[0]!.atM / 1000).toBeCloseTo(78.7, 0);
  });

  it('counts a ferry or flight by its ends, and crossings between segments', () => {
    const crossings = findCrossings(index, [
      { segmentId: 'ride', endsOnly: false, coords: line([6, 45.5], [6, 45.8], 20) },
      { segmentId: 'ferry', endsOnly: true, coords: [[6, 45.8], [6, 46.5]] },
      { segmentId: 'ride2', endsOnly: false, coords: line([6, 46.5], [8, 46.5], 50) },
    ]);
    expect(crossings.map((c) => [c.from.code, c.to.code, c.segmentId, !!c.byAir])).toEqual([['FR', 'CH', 'ferry', true]]);
  });

  it('never reports a gap between segments as a crossing', () => {
    const crossings = findCrossings(index, [
      { segmentId: 'france', endsOnly: false, coords: line([5.5, 45], [6, 45], 20) },
      { segmentId: 'italy', endsOnly: false, coords: line([8, 45], [8.5, 45], 20) },
    ]);
    expect(crossings).toEqual([]);
  });

  it('ignores riding along a border', () => {
    const zigzag: [number, number][] = [
      [6.9, 45],
      [6.95, 45],
      [7.01, 45],
      [7.015, 45.01],
      [6.99, 45.02],
      [6.95, 45.03],
      [6.9, 45.04],
    ];
    expect(findCrossings(index, [{ segmentId: 's', endsOnly: false, coords: zigzag }])).toEqual([]);
  });

  it('ignores stretches at sea', () => {
    expect(findCrossings(index, [{ segmentId: 's', endsOnly: false, coords: line([6, 45.5], [6, 46.5]) }]).map((c) => c.to.code)).toEqual(['CH']);
  });
});
