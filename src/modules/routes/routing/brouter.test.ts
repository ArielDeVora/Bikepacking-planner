import { describe, expect, it } from 'vitest';
import { brouterUrl, classifyError } from './brouter';

describe('BRouter provider', () => {
  it('builds the request URL', () => {
    const url = new URL(
      brouterUrl({
        from: [2.3522, 48.8566],
        to: [2.37, 48.86],
        profile: 'trekking',
        nogos: [
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        ],
      }),
    );
    expect(url.origin + url.pathname).toBe('https://brouter.de/brouter');
    expect(url.searchParams.get('lonlats')).toBe('2.352200,48.856600|2.370000,48.860000');
    expect(url.searchParams.get('profile')).toBe('trekking');
    expect(url.searchParams.get('format')).toBe('geojson');
    expect(url.searchParams.get('polygons')).toBe('1.000000,2.000000,3.000000,4.000000,5.000000,6.000000');
  });

  it('classifies errors', () => {
    expect(classifyError(403, 'Please, retry later!').kind).toBe('rateLimit');
    expect(classifyError(429, '').kind).toBe('rateLimit');
    expect(classifyError(500, 'datafile W30_N40.rd5 not found').kind).toBe('noRoute');
    expect(classifyError(500, 'from-position not mapped in existing datafile').kind).toBe('noRoute');
    expect(classifyError(500, 'boom').kind).toBe('server');
  });
});
