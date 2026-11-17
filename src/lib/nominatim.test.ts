import { describe, expect, it } from 'vitest';
import { nominatimSearchUrl, toNominatimResults, withoutGenericWords } from './nominatim';

describe('nominatim search', () => {
  it('builds the search URL', () => {
    const url = new URL(nominatimSearchUrl('eiffel tower'));
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('eiffel tower');
    expect(url.searchParams.get('format')).toBe('jsonv2');
  });

  it('turns Nominatim places into results', () => {
    const [tower, bad] = toNominatimResults([
      {
        osm_type: 'way',
        osm_id: 5013364,
        lat: '48.8582',
        lon: '2.2945',
        category: 'man_made',
        type: 'tower',
        name: 'Eiffel Tower',
        display_name: 'Eiffel Tower, Avenue Anatole France, Paris, Île-de-France, France',
        boundingbox: ['48.8574', '48.8590', '2.2933', '2.2956'],
        address: { tourism: 'Eiffel Tower', road: 'Avenue Anatole France', house_number: '5', city: 'Paris', state: 'Île-de-France', postcode: '75007', country: 'France' },
      },
      { lat: 'x', lon: '2' },
    ]);
    expect(bad).toBeUndefined();
    expect(tower!.name).toBe('Eiffel Tower');
    expect(tower!.detail).toBe('Avenue Anatole France 5, Paris, Île-de-France, France');
    expect(tower!.kind).toBe('tower');
    expect(tower!.lngLat).toEqual([2.2945, 48.8582]);
    expect(tower!.bbox).toEqual([2.2933, 48.8574, 2.2956, 48.859]);
    expect(tower!.osm).toEqual({ type: 'way', id: 5013364, tags: { man_made: 'tower' } });
  });

  it('drops generic words for a second try', () => {
    expect(withoutGenericWords('Bokty Mountain')).toBe('Bokty');
    expect(withoutGenericWords('Mt. Ararat')).toBe('Ararat');
    expect(withoutGenericWords('Mont Blanc')).toBe('Blanc');
    expect(withoutGenericWords('Kathmandu')).toBeNull();
    expect(withoutGenericWords('mountain')).toBeNull();
  });
});
