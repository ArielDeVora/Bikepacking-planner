import { type Country, type CountryIndex } from '../../lib/countries';
import { distance } from '../../lib/geo/geo';
import type { Coord } from '../../lib/geo/polyline';
import type { LngLat } from '../../model/types';

export interface Crossing {
  from: { code: string; name: string };
  to: { code: string; name: string };
  lngLat: LngLat;
  segmentId: string;
  /** Distance from the start of the trip, in metres. */
  atM: number;
  /** For flights and ferries: the countries at both ends differ, the crossing is at arrival. */
  byAir?: boolean;
}

export interface CrossingState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  crossings: Crossing[];
}

export interface TripLine {
  segmentId: string;
  /** Planes and boats: only the countries at both ends count. */
  endsOnly: boolean;
  coords: Coord[];
}

const SAMPLE_M = 2000;
const PRECISION_M = 150;
/** Consecutive segments whose ends are farther apart than this aren't one continuous journey. */
const JOIN_M = 5000;
/** Crossing a border and back within this distance (riding along it) isn't reported. */
const ZIGZAG_M = 3000;

/**
 * Where the trip changes country, in order. Ground segments are sampled about every 2 km and
 * each change is narrowed down to ~150 m; stretches at sea are skipped (a ferry from country A
 * landing in country B still counts, at landing). Only continuous parts of the trip count: a gap
 * between two segments (not drawn yet, say) is never reported as a crossing.
 */
export function findCrossings(index: CountryIndex, lines: TripLine[]): Crossing[] {
  const out: Crossing[] = [];
  let last: Country | null = null;
  let lastEnd: readonly number[] | null = null;
  let total = 0;

  const emit = (to: Country, lngLat: LngLat, segmentId: string, atM: number, byAir?: boolean) => {
    if (last && last.code !== to.code) out.push({ from: { code: last.code, name: last.name }, to: { code: to.code, name: to.name }, lngLat, segmentId, atM, ...(byAir ? { byAir } : {}) });
    last = to;
  };

  for (const line of lines) {
    const c = line.coords;
    if (c.length < 2) continue;
    if (lastEnd && distance(lastEnd as LngLat, c[0]!) > JOIN_M) last = null;
    lastEnd = c.at(-1)!;
    let length = 0;
    for (let i = 1; i < c.length; i++) length += distance(c[i - 1]!, c[i]!);
    if (line.endsOnly) {
      const start = index.at(c[0]!);
      if (start) last = last ?? start;
      const end = index.at(c.at(-1)!);
      if (end) emit(end, [c.at(-1)![0], c.at(-1)![1]], line.segmentId, total + length, true);
      total += length;
      continue;
    }
    let walked = 0;
    let sinceSample = Infinity;
    let prevPoint: readonly number[] | null = null;
    let prevCountry: Country | null = null;
    let prevAt = 0;
    for (let i = 0; i < c.length; i++) {
      if (i > 0) {
        const d = distance(c[i - 1]!, c[i]!);
        walked += d;
        sinceSample += d;
      }
      if (sinceSample < SAMPLE_M && i < c.length - 1) continue;
      sinceSample = 0;
      const here = index.at(c[i]!);
      if (!here) continue;
      if (prevPoint && prevCountry && here.code !== prevCountry.code) {
        const [lngLat, at] = narrow(index, prevPoint, c[i]!, prevCountry, prevAt, walked);
        emit(here, lngLat, line.segmentId, total + at);
      } else if (!last) {
        last = here;
      } else if (here.code !== last.code) {
        // Continuing from the previous segment into another country (they touch at a border).
        emit(here, [c[i]![0], c[i]![1]], line.segmentId, total + walked);
      }
      prevPoint = c[i]!;
      prevCountry = here;
      prevAt = walked;
    }
    total += length;
  }
  return dropZigzags(out);
}

/** Removes pairs like A→B then B→A a short distance apart (a route running along a border). */
function dropZigzags(list: Crossing[]): Crossing[] {
  const out: Crossing[] = [];
  for (const c of list) {
    const prev = out.at(-1);
    if (prev && !c.byAir && !prev.byAir && prev.to.code === c.from.code && prev.from.code === c.to.code && c.atM - prev.atM < ZIGZAG_M) {
      out.pop();
      continue;
    }
    out.push(c);
  }
  return out;
}

/** Bisects a straight stretch between two countries down to PRECISION_M. */
function narrow(index: CountryIndex, a: readonly number[], b: readonly number[], from: Country, atA: number, atB: number): [LngLat, number] {
  let lo = { p: a, at: atA };
  let hi = { p: b, at: atB };
  while (distance(lo.p as LngLat, hi.p as LngLat) > PRECISION_M) {
    const mid = { p: [(lo.p[0]! + hi.p[0]!) / 2, (lo.p[1]! + hi.p[1]!) / 2], at: (lo.at + hi.at) / 2 };
    if (index.at(mid.p)?.code === from.code) lo = mid;
    else hi = mid;
  }
  return [[hi.p[0]!, hi.p[1]!], hi.at];
}
