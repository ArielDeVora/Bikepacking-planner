import { describe, expect, it } from 'vitest';
import { parseCoordinates, photonUrl, toResults } from './photon';

describe('search', () => {
  it('parses coordinates, latitude first', () => {
    expect(parseCoordinates('45.92, 6.87')).toEqual([6.87, 45.92]);
    expect(parseCoordinates('-33.9 18.42')).toEqual([18.42, -33.9]);
    expect(parseCoordinates('95, 10')).toBeNull();
    expect(parseCoordinates('Tbilisi')).toBeNull();
  });

  it('builds the Photon URL with a location bias', () => {
    const url = new URL(photonUrl('tbilisi', [44.8, 41.7]));
    expect(url.searchParams.get('q')).toBe('tbilisi');
    expect(url.searchParams.get('lat')).toBe('41.7000');
    expect(url.searchParams.get('lang')).toBe('en');
  });

  it('turns Photon features into results', () => {
    const [city, shop] = toResults({
      features: [
        {
          properties: { name: 'Tbilisi', osm_type: 'R', osm_id: 1, osm_key: 'place', osm_value: 'city', country: 'Georgia', extent: [44.6, 41.8, 45.0, 41.6] },
          geometry: { coordinates: [44.79, 41.69] },
        },
        {
          properties: { name: 'Velo', osm_type: 'N', osm_id: 2, osm_key: 'shop', osm_value: 'bicycle', street: 'Rustaveli', city: 'Tbilisi', country: 'Georgia' },
          geometry: { coordinates: [44.8, 41.7] },
        },
      ],
    });
    expect(city!.detail).toBe('Georgia');
    expect(city!.bbox).toEqual([44.6, 41.6, 45.0, 41.8]);
    expect(shop!.detail).toBe('Rustaveli, Tbilisi, Georgia');
    expect(shop!.kind).toBe('bicycle');
    expect(shop!.category).toBe('bikeShop');
    expect(shop!.osm).toEqual({ type: 'node', id: 2, tags: { shop: 'bicycle' } });
  });
});
