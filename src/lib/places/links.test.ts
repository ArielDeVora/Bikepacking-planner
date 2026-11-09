import { describe, expect, it } from 'vitest';
import { describeTags, formatLngLat, placeLinks } from './links';

describe('place links', () => {
  it('links to map apps, OSM objects and Wikipedia', () => {
    const links = placeLinks([7.65, 45.97], 'Matterhorn', { type: 'node', id: 123, tags: { wikipedia: 'de:Matterhorn Peak', wikidata: 'Q1374' } });
    expect(links.map((l) => l.label)).toEqual(['Google Maps', 'OpenStreetMap', 'Wikipedia', 'Wikidata']);
    expect(links[1]!.href).toBe('https://www.openstreetmap.org/node/123');
    expect(links[2]!.href).toBe('https://de.wikipedia.org/wiki/Matterhorn_Peak');
  });

  it('adds Chinese map apps inside China', () => {
    const labels = placeLinks([116.4, 39.9], 'Beijing').map((l) => l.label);
    expect(labels).toContain('Amap');
    expect(labels).toContain('Baidu');
    expect(placeLinks([2.35, 48.85], 'Paris').map((l) => l.label)).not.toContain('Amap');
  });

  it('describes useful tags', () => {
    const rows = describeTags({ 'addr:street': 'Rue X', 'addr:housenumber': '3', 'addr:city': 'Lyon', phone: '+33 4 12 34', website: 'example.org/' });
    expect(rows).toEqual([
      { key: 'address', value: 'Rue X 3, Lyon', href: undefined },
      { key: 'phone', value: '+33 4 12 34', href: 'tel:+33412' + '34' },
      { key: 'website', value: 'example.org', href: 'https://example.org/' },
    ]);
    expect(formatLngLat([6.123456, 45.987654])).toBe('45.98765, 6.12346');
  });
});
