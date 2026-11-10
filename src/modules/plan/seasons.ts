import { SEASON_REGION_RADIUS_M, SEASON_REGIONS, type SeasonRegion } from '../../config/seasons';
import { distance } from '../../lib/geo/geo';
import type { LngLat } from '../../model/types';
import type { ClimateValues } from '../climate/data';

/** How good a time of year is to ride somewhere: 2 good, 1 so-so, 0 bad. */
export type Rating = 0 | 1 | 2;

/**
 * Thresholds fitted to the team's own season table (70% of its cells match; the rest is down to
 * things climate averages don't show, like smoke or typhoons).
 */
export const SEASON_RULE = {
  /** Bad above this much rain (mm a month), daytime high (°C), or below this night low (°C). */
  badRain: 220,
  badHot: 36,
  badCold: -2,
  /** Good below this much rain, below this high, and above this low. */
  goodRain: 180,
  goodHot: 33.5,
  goodCold: 3,
};

export function rateClimate(v: ClimateValues, rule = SEASON_RULE): Rating {
  if (v.ppt > rule.badRain || v.tmax > rule.badHot || v.tmin < rule.badCold) return 0;
  if (v.ppt < rule.goodRain && v.tmax < rule.goodHot && v.tmin > rule.goodCold) return 2;
  return 1;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Index (0–47) of a date in the hand-rated tables: four per month, from March. */
export function seasonWeek(date: Date): number {
  const m = date.getUTCMonth();
  const q = Math.min(3, Math.floor((date.getUTCDate() - 1) / (MONTH_DAYS[m]! / 4)));
  return ((m + 10) % 12) * 4 + q;
}

/** The nearest hand-rated region, if the place is close enough to one. */
export function nearestRegion(p: LngLat): SeasonRegion | null {
  let best: SeasonRegion | null = null;
  let bestD = SEASON_REGION_RADIUS_M;
  for (const r of SEASON_REGIONS) {
    const d = distance(p, r.lngLat);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export interface Season {
  rating: Rating;
  /** The hand-rated region it comes from, else rated from climate averages. */
  region?: SeasonRegion;
  climate?: ClimateValues;
}

/** Day of the year (0–364) of a date. */
export const dayOfYear = (date: Date) =>
  Math.min(364, Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000));

/** How good the season is at a place on a date: the team's own rating nearby, else from climate averages. */
export function seasonAt(
  p: LngLat,
  date: Date,
  sample: (lng: number, lat: number, day: number) => ClimateValues | null,
  region: SeasonRegion | null = nearestRegion(p),
): Season | null {
  const climate = sample(p[0], p[1], dayOfYear(date)) ?? undefined;
  if (region) return { rating: Number(region.weeks[seasonWeek(date)]) as Rating, region, climate };
  return climate ? { rating: rateClimate(climate), climate } : null;
}
