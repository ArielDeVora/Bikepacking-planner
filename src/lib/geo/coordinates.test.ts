import { describe, expect, it } from 'vitest';
import { parseCoordinates } from './coordinates';

const near = (q: string, lat: number, lng: number) => {
  const p = parseCoordinates(q);
  expect(p, q).not.toBeNull();
  expect(p![1], `${q} latitude`).toBeCloseTo(lat, 5);
  expect(p![0], `${q} longitude`).toBeCloseTo(lng, 5);
};

// 41°41'24"N 44°48'00"E = 41.69, 44.8
const LAT = 41 + 41 / 60 + 24 / 3600;
const LNG = 44.8;

describe('parseCoordinates', () => {
  it('reads decimal degrees, latitude first', () => {
    near('45.92, 6.87', 45.92, 6.87);
    near('45.92 6.87', 45.92, 6.87);
    near('-33.9 18.42', -33.9, 18.42);
    near('45,92; 6,87', 45.92, 6.87);
    near('45,92 6,87', 45.92, 6.87);
    near('41.69N 44.8E', 41.69, 44.8);
    near('33.9S, 18.42E', -33.9, 18.42);
    near('44.8E 41.69N', 41.69, 44.8);
  });

  it('reads degrees, minutes and seconds with hemispheres', () => {
    near(`41°41'24"N 44°48'00"E`, LAT, LNG);
    near(`41°41'24.0"N 44°48'00.0"E`, LAT, LNG);
    near(`41° 41' 24" N, 44° 48' 0" E`, LAT, LNG);
    near(`N 41° 41' 24" E 44° 48'`, LAT, LNG);
    near(`N41°41'24" E44°48'`, LAT, LNG);
    near(`41º41′24″N 44º48′E`, LAT, LNG);
    near(`41°41’24”N 44°48’E`, LAT, LNG);
    near(`41 41 24 N 44 48 0 E`, LAT, LNG);
    near(`41d41m24s N, 44d48m E`, LAT, LNG);
    near(`41°41'24"n 44°48'e`, LAT, LNG);
    near(`33°55'S 18°25'E`, -(33 + 55 / 60), 18 + 25 / 60);
    near(`34°36'S 58°22'W`, -34.6, -(58 + 22 / 60));
    near(`44°48'E 41°41'24"N`, LAT, LNG);
  });

  it('reads degrees and decimal minutes', () => {
    near(`N 41° 41.4' E 44° 48'`, LAT, LNG);
    near(`41°41.4'N 44°48.0'E`, LAT, LNG);
  });

  it('reads degree signs without letters, and bare numbers', () => {
    near(`41°41'24" 44°48'0"`, LAT, LNG);
    near(`-33°54' 18°25'`, -33.9, 18 + 25 / 60);
    near('41 41 24 44 48 0', LAT, LNG);
    near('41 41.4 44 48', LAT, LNG);
  });

  it('rejects what is not a position', () => {
    for (const q of ['Tbilisi', 'Nice', 'SEN', '95, 10', '10, 190', `41°61'N 44°E`, `41°41'61"N 44°E`, '41N 44N', '41E 44W', '-41S 44E', '12', '1 2 3', ''])
      expect(parseCoordinates(q), q).toBeNull();
  });
});
