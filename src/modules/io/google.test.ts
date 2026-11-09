import { describe, expect, it } from 'vitest';
import { coordsFromGoogleUrl, parseGoogleList } from './google';

describe('Google Maps lists', () => {
  it('reads positions from the usual link formats', () => {
    expect(coordsFromGoogleUrl('https://www.google.com/maps/search/41.716537,+44.783333')).toEqual([44.783333, 41.716537]);
    expect(coordsFromGoogleUrl('https://www.google.com/maps/place/X/@41.69,44.80,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.6941!4d44.8015')).toEqual([44.8015, 41.6941]);
    expect(coordsFromGoogleUrl('https://maps.google.com/?q=45.9,6.87')).toEqual([6.87, 45.9]);
    expect(coordsFromGoogleUrl('https://www.google.com/maps/search/41.71%2C44.78')).toEqual([44.78, 41.71]);
    expect(coordsFromGoogleUrl('https://www.google.com/maps/place/Narikala/data=!4m2!3m1!1s0x40440cd7e64f626b:0x4f907964122d4ac2')).toBeNull();
  });

  it('parses a Takeout list, setting aside places without a position', () => {
    const csv = [
      'Title,Note,URL,Comment',
      'Narikala,Fortress,https://www.google.com/maps/place/Narikala/data=!4m2!3m1!1s0x404:0x4f9,',
      '"Bakery, old town",,"https://www.google.com/maps/search/41.69,44.80",Great bread',
    ].join('\n');
    const out = parseGoogleList(csv)!;
    expect(out.waypoints).toEqual([
      { name: 'Bakery, old town', desc: 'Great bread', lngLat: [44.8, 41.69], links: ['https://www.google.com/maps/search/41.69,44.80'] },
    ]);
    expect(out.unlocated).toEqual([{ name: 'Narikala', desc: 'Fortress', url: 'https://www.google.com/maps/place/Narikala/data=!4m2!3m1!1s0x404:0x4f9' }]);
    expect(parseGoogleList('a,b\n1,2')).toBeNull();
  });
});
