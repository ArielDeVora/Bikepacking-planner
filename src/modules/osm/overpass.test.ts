import { describe, expect, it } from 'vitest';
import { OSM_CATEGORIES } from '../../config/pois';
import { buildQuery, parseElements, tileAt, tileBounds, tilesAlongLine, tilesInBounds } from './overpass';

const cat = (id: string) => OSM_CATEGORIES.find((c) => c.id === id)!;

describe('overpass helpers', () => {
  it('maps points to tiles and back', () => {
    const tile = tileAt([7.6586, 45.9763]);
    const b = tileBounds(tile);
    expect(b.west).toBeLessThan(7.6586);
    expect(b.east).toBeGreaterThan(7.6586);
    expect(b.south).toBeLessThan(45.9763);
    expect(b.north).toBeGreaterThan(45.9763);
  });

  it('lists tiles in a box and along a line', () => {
    expect(tilesInBounds(7.5, 45.8, 7.8, 46.1).length).toBeGreaterThanOrEqual(4);
    const along = tilesAlongLine([
      [7, 45],
      [8, 45],
    ]);
    expect(along).toContain(tileAt([7.5, 45]));
    expect(along.length).toBeGreaterThanOrEqual(6);
  });

  it('builds one query for several categories', () => {
    const q = buildQuery(tileAt([7, 45]), [cat('water'), cat('camp')]);
    expect(q.startsWith('[out:json][timeout:25];(')).toBe(true);
    expect(q).toContain('nwr["amenity"="drinking_water"](');
    expect(q).toContain('nwr["tourism"="camp_site"](');
    expect(q.endsWith('out center tags qt;')).toBe(true);
  });

  it('parses nodes and ways, by category', () => {
    const places = parseElements(
      {
        elements: [
          { type: 'node', id: 1, lat: 45, lon: 7, tags: { amenity: 'drinking_water' } },
          { type: 'way', id: 2, center: { lat: 45.1, lon: 7.1 }, tags: { tourism: 'camp_site', name: 'Camping' } },
          { type: 'node', id: 3, lat: 45, lon: 7, tags: { amenity: 'bench' } },
        ],
      },
      [cat('water'), cat('camp')],
    );
    expect(places.map((p) => [p.key, p.category, p.lngLat])).toEqual([
      ['node/1', 'water', [7, 45]],
      ['way/2', 'camp', [7.1, 45.1]],
    ]);
  });
});
