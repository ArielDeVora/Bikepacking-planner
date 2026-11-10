import type { LngLat } from '../model/types';

/**
 * Seasons the team rated by hand (good, so-so, bad), for regions they researched: one rating per
 * quarter of a month, March to February. They take precedence over ratings computed from climate
 * data near these places.
 */
export interface SeasonRegion {
  name: string;
  city: string;
  lngLat: LngLat;
  /** 48 characters: 2 good, 1 so-so, 0 bad; four per month from March. */
  weeks: string;
}

export const SEASON_REGIONS: SeasonRegion[] = [
  { name: 'Tibetan plateau', city: 'Lhasa', lngLat: [91.1, 29.65], weeks: '111122222222111100000000111122221111000000000000' },
  { name: 'Yunnan', city: 'Kunming', lngLat: [102.71, 25.04], weeks: '222222222222111100000000111111112222222222222222' },
  { name: 'South China coast', city: 'Hong Kong', lngLat: [114.17, 22.32], weeks: '222211110000000000000000000011112222222222222222' },
  { name: 'East China coast', city: 'Shanghai', lngLat: [121.47, 31.23], weeks: '111122222222000000000000222222222222111100000000' },
  { name: 'North China', city: 'Beijing', lngLat: [116.4, 39.9], weeks: '111122222222222200001111222222221111000000001111' },
  { name: 'Northern deserts', city: 'Ürümqi', lngLat: [87.62, 43.83], weeks: '000011112222222222222222222211110000000000000000' },
  { name: 'Southwest peninsula', city: 'Phuket', lngLat: [98.39, 7.88], weeks: '222211110000111111110000000000001111222222222222' },
  { name: 'Southeast peninsula', city: 'Koh Samui', lngLat: [100.01, 9.51], weeks: '222222221111111111111111111100000000000022222222' },
  { name: 'Rainy coast', city: 'Koh Chang', lngLat: [102.33, 12.05], weeks: '222211110000000000000000000000001111222222222222' },
  { name: 'Central Thailand', city: 'Bangkok', lngLat: [100.5, 13.75], weeks: '111100000000111111110000000000002222222222222222' },
  { name: 'Northern Thailand', city: 'Chiang Mai', lngLat: [98.98, 18.79], weeks: '000000001111111111110000000022222222222222222222' },
  { name: 'Central Cambodia', city: 'Siem Reap', lngLat: [103.86, 13.36], weeks: '111111111111111111110000000011112222222222222222' },
  { name: 'Southern Cambodia', city: 'Sihanoukville', lngLat: [103.52, 10.63], weeks: '222211111111000000000000000000002222222222222222' },
  { name: 'Eastern Cambodia', city: 'Banlung', lngLat: [106.99, 13.74], weeks: '222222221111000000000000000011112222222222222222' },
  { name: 'Southern Vietnam', city: 'Ho Chi Minh City', lngLat: [106.63, 10.82], weeks: '222222221111000000000000000011112222222222222222' },
  { name: 'Central Vietnam', city: 'Hoi An', lngLat: [108.33, 15.88], weeks: '222222222222222222221111000000000000000011112222' },
  { name: 'Northern Vietnam', city: 'Hanoi', lngLat: [105.85, 21.03], weeks: '111122221111111100000000000022222222222211111111' },
  { name: 'Okinawa', city: 'Naha', lngLat: [127.68, 26.21], weeks: '222222220000000011110000000022222222111111111111' },
  { name: 'Western Japan', city: 'Hiroshima', lngLat: [132.46, 34.39], weeks: '111122222222000000001111111122222222111100000000' },
  { name: 'Japanese Alps', city: 'Nagano', lngLat: [138.18, 36.65], weeks: '000011112222222211112222222222221111000000000000' },
  { name: 'Central Japan', city: 'Kyoto', lngLat: [135.77, 35.01], weeks: '111122222222222211111111222222222222111100000000' },
  { name: 'Eastern Japan', city: 'Tokyo', lngLat: [139.69, 35.68], weeks: '222222222222222222222222222222222222111111111111' },
  { name: 'Hokkaido', city: 'Sapporo', lngLat: [141.35, 43.06], weeks: '000011112222222222222222222211110000000000000000' },
];

/** Hand-rated seasons apply within this distance of their city. */
export const SEASON_REGION_RADIUS_M = 300_000;
