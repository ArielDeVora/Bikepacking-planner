import { describe, expect, it } from 'vitest';
import { corridor, planTiles, tileAt, TILE_BUDGET } from './tiles';

describe('offline map tiles', () => {
  it('finds the tile of a place', () => {
    expect(tileAt(0, 0, 1)).toEqual([1, 1]);
    expect(tileAt(-180, 85, 2)).toEqual([0, 0]);
    expect(tileAt(2.35, 48.85, 12)).toEqual([2074, 1409]); // Paris
  });

  it('covers a line without gaps, with tiles on each side', () => {
    const line = [[2, 48], [6, 48]];
    const thin = corridor(line, 10, 0);
    const xs = [...thin].map((t) => Number(t.split('/')[1])).sort((a, b) => a - b);
    expect(xs.at(-1)! - xs[0]! + 1).toBe(xs.length); // every column between the ends
    expect(corridor(line, 10, 1).size).toBe(thin.size * 3 + 6);
  });

  it('saves zooms 6 to 13 for a stage, and fewer for a long one', () => {
    const stage = [[6.6, 46.5], [7.4, 46.2], [8.0, 46.3]]; // ~110 km in the Valais
    const short = planTiles(stage);
    expect(short).toMatchObject({ maxZoom: 13, tooBig: false });
    expect(short.tiles.length).toBeLessThanOrEqual(TILE_BUDGET);
    const long = planTiles([[-9, 43], [2, 43], [12, 45], [28, 44]]); // across Europe
    expect(long.maxZoom).toBeLessThan(13);
    expect(long.tiles.length).toBeGreaterThan(0);
  });
});

describe('saved tile addresses', () => {
  it('leave out OpenFreeMap’s weekly version, so saved tiles keep matching', async () => {
    const { tileKey } = await import('./download');
    expect(tileKey('https://tiles.openfreemap.org/planet/20251105_001001_pt/12/2074/1409.pbf')).toBe('https://tiles.openfreemap.org/planet/12/2074/1409.pbf');
    expect(tileKey('https://tiles.openfreemap.org/styles/liberty')).toBe('https://tiles.openfreemap.org/styles/liberty');
  });
});
