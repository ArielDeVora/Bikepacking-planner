import { describe, expect, it } from 'vitest';
import { nominatimUrl, osmFromTileId, parseNominatim, parseWikipediaTag } from './details';

describe('place details', () => {
  it('decodes OpenFreeMap feature ids', () => {
    expect(osmFromTileId(115114743941)).toEqual({ type: 'node', id: 11511474394 });
    expect(osmFromTileId(383268532)).toEqual({ type: 'way', id: 38326853 });
    expect(osmFromTileId('123')).toEqual({ type: 'relation', id: 12 });
    expect(osmFromTileId(120)).toBeNull();
    expect(osmFromTileId(undefined)).toBeNull();
  });

  it('builds the Nominatim lookup and reads its answer', () => {
    const url = new URL(nominatimUrl('way', 38326853));
    expect(url.searchParams.get('osm_ids')).toBe('W38326853');
    expect(url.searchParams.get('extratags')).toBe('1');
    expect(
      parseNominatim([
        {
          category: 'amenity',
          type: 'cafe',
          name: 'Kafe',
          extratags: { opening_hours: 'Mo-Su 09:00-22:00', wikidata: 'Q1' },
          address: { road: 'Rustaveli', house_number: '5', city: 'Tbilisi', country: 'Georgia' },
        },
      ]),
    ).toEqual({ tags: { opening_hours: 'Mo-Su 09:00-22:00', wikidata: 'Q1', amenity: 'cafe', name: 'Kafe' }, address: 'Rustaveli 5, Tbilisi, Georgia' });
    expect(parseNominatim([])).toBeNull();
  });

  it('parses wikipedia tags', () => {
    expect(parseWikipediaTag('fr:Tour Eiffel')).toEqual({ lang: 'fr', title: 'Tour Eiffel' });
    expect(parseWikipediaTag('Tour Eiffel')).toBeNull();
  });
});
