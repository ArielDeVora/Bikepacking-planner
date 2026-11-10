import { describe, expect, it } from 'vitest';
import { nearestRegion, rateClimate, seasonAt, seasonWeek } from './seasons';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('seasons', () => {
  it('rates climate averages with the thresholds fitted to the team’s table', () => {
    expect(rateClimate({ tmax: 24, tmin: 11, ppt: 40 })).toBe(2);
    expect(rateClimate({ tmax: 34, tmin: 22, ppt: 90 })).toBe(1);
    expect(rateClimate({ tmax: 31, tmin: 25, ppt: 300 })).toBe(0); // monsoon
    expect(rateClimate({ tmax: 37, tmin: 25, ppt: 10 })).toBe(0); // heat
    expect(rateClimate({ tmax: 5, tmin: -8, ppt: 10 })).toBe(0); // frost
  });

  it('finds a date’s quarter-month in the team’s table (from March)', () => {
    expect(seasonWeek(d('2027-03-01'))).toBe(0);
    expect(seasonWeek(d('2027-03-31'))).toBe(3);
    expect(seasonWeek(d('2027-08-17'))).toBe(22);
    expect(seasonWeek(d('2028-02-29'))).toBe(47);
  });

  it('prefers the team’s rating near one of their regions, else climate averages', () => {
    const kunming: [number, number] = [102.8, 25.1];
    expect(nearestRegion(kunming)?.city).toBe('Kunming');
    expect(nearestRegion([2.35, 48.85])).toBeNull();
    const sample = () => ({ tmax: 24, tmin: 11, ppt: 40 });
    expect(seasonAt(kunming, d('2027-07-15'), sample)).toMatchObject({ rating: 0 }); // Yunnan's rainy season, by the team
    expect(seasonAt([2.35, 48.85], d('2027-07-15'), sample)).toMatchObject({ rating: 2 });
    expect(seasonAt([2.35, 48.85], d('2027-07-15'), () => null)).toBeNull();
  });
});
