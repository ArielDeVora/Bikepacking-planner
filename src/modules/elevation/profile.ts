import { distance, elevationGain } from '../../lib/geo/geo';
import { legCoords } from '../../model/segment';
import type { Segment } from '../../model/types';

export interface Profile {
  /** Cumulative distance in metres. */
  d: Float64Array;
  /** Elevation in metres, NaN where unknown. */
  e: Float64Array;
  lng: Float64Array;
  lat: Float64Array;
  lengthM: number;
  ascentM: number;
  descentM: number;
  minEle: number;
  maxEle: number;
  /** Where each segment starts and ends along the profile, in metres. */
  ranges: { id: string; from: number; to: number }[];
}

/**
 * One profile along the given segments, in order. Distance doesn't jump across gaps between
 * segments that don't touch, and neither does the climb.
 */
export function buildProfile(segments: Segment[]): Profile {
  let n = 0;
  for (const s of segments) for (const leg of s.legs) n += legCoords(leg).length;
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  const lng = new Float64Array(n);
  const lat = new Float64Array(n);
  let i = 0;
  let total = 0;
  const starts = new Set<number>();
  const ranges: Profile['ranges'] = [];
  for (const s of segments) {
    let first = true;
    starts.add(i);
    const from = total;
    for (const leg of s.legs) {
      for (const c of legCoords(leg)) {
        if (i > 0 && !first) total += distance([lng[i - 1]!, lat[i - 1]!], c);
        first = false;
        d[i] = total;
        e[i] = c.length === 3 ? c[2] : NaN;
        lng[i] = c[0];
        lat[i] = c[1];
        i++;
      }
    }
    ranges.push({ id: s.id, from, to: total });
  }

  let ascentM = 0;
  let descentM = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  let run: number[] = [];
  const flush = () => {
    const g = elevationGain(run);
    ascentM += g.ascent;
    descentM += g.descent;
    run = [];
  };
  for (let k = 0; k < n; k++) {
    const v = e[k]!;
    // Climb is counted per segment, so a jump between segments that don't touch isn't a climb.
    if (starts.has(k)) flush();
    if (Number.isNaN(v)) {
      flush();
      continue;
    }
    run.push(v);
    if (v < minEle) minEle = v;
    if (v > maxEle) maxEle = v;
  }
  flush();
  return { d, e, lng, lat, lengthM: total, ascentM: Math.round(ascentM), descentM: Math.round(descentM), minEle, maxEle, ranges };
}

/** Index of the last point at or before `dist`. */
export function indexAt(p: Profile, dist: number): number {
  let lo = 0;
  let hi = p.d.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.d[mid]! <= dist) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Elevation at a distance, interpolated; NaN in gaps. */
export function eleAt(p: Profile, dist: number): number {
  const i = indexAt(p, dist);
  const j = Math.min(i + 1, p.d.length - 1);
  const span = p.d[j]! - p.d[i]!;
  if (span <= 0) return p.e[i]!;
  const t = (dist - p.d[i]!) / span;
  return p.e[i]! + (p.e[j]! - p.e[i]!) * t;
}

/** Position at a distance, interpolated. */
export function positionAt(p: Profile, dist: number): [number, number] {
  const i = indexAt(p, dist);
  const j = Math.min(i + 1, p.d.length - 1);
  const span = p.d[j]! - p.d[i]!;
  const t = span > 0 ? (dist - p.d[i]!) / span : 0;
  return [p.lng[i]! + (p.lng[j]! - p.lng[i]!) * t, p.lat[i]! + (p.lat[j]! - p.lat[i]!) * t];
}

/** Gradient in percent around a distance, over at least `windowM`. */
export function gradeAt(p: Profile, from: number, to: number, windowM = 100): number {
  const mid = (from + to) / 2;
  const half = Math.max(windowM, to - from) / 2;
  const a = Math.max(0, mid - half);
  const b = Math.min(p.lengthM, mid + half);
  if (b <= a) return 0;
  return ((eleAt(p, b) - eleAt(p, a)) / (b - a)) * 100;
}

const GRADE_COLORS: [number, string][] = [
  [3, '#8ce99a'],
  [6, '#ffd43b'],
  [9, '#ffa94d'],
  [12, '#ff6b6b'],
  [Infinity, '#c92a2a'],
];

/** Fill colour for a gradient: by steepness, the same for climbs and descents. */
export function gradeColor(grade: number): string {
  const g = Math.abs(grade);
  return GRADE_COLORS.find(([max]) => g < max)![1];
}

export const GRADE_LEGEND = GRADE_COLORS.map(([max, color], i) => ({
  color,
  label: max === Infinity ? `${GRADE_COLORS[i - 1]![0]}%+` : `<${max}%`,
}));
