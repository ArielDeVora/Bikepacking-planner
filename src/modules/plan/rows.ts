import type { CountryIndex } from '../../lib/countries';
import { distance } from '../../lib/geo/geo';
import { legCoords } from '../../model/segment';
import type { LngLat, Segment, TravelMode } from '../../model/types';

/** A point along the route, `km` from its start. */
interface Sample {
  km: number;
  p: LngLat;
}

/** Positions along a whole route, by distance from its start (as the schedule counts it). */
export class RouteLine {
  readonly samples: Sample[] = [];
  /** Where each segment starts and ends along the route. */
  readonly ranges = new Map<string, { from: number; to: number }>();

  constructor(segments: Segment[]) {
    let km = 0;
    for (const seg of segments) {
      const coords = seg.legs.flatMap((leg) => legCoords(leg).map((c) => [c[0], c[1]] as LngLat));
      const length = seg.stats.lengthM / 1000;
      // Distances along the drawn line, scaled to the segment's length.
      const along = [0];
      for (let i = 1; i < coords.length; i++) along.push(along[i - 1]! + distance(coords[i - 1]!, coords[i]!) / 1000);
      const drawn = along.at(-1) || 1;
      coords.forEach((p, i) => this.samples.push({ km: km + (along[i]! / drawn) * length, p }));
      this.ranges.set(seg.id, { from: km, to: km + length });
      km += length;
    }
  }

  /** The position `km` along the route. */
  pointAt(km: number): LngLat | null {
    const s = this.samples;
    if (!s.length) return null;
    let lo = 0;
    let hi = s.length - 1;
    if (km <= s[0]!.km) return s[0]!.p;
    if (km >= s[hi]!.km) return s[hi]!.p;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.km <= km) lo = mid;
      else hi = mid;
    }
    const a = s[lo]!;
    const b = s[hi]!;
    const w = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
    return [a.p[0] + (b.p[0] - a.p[0]) * w, a.p[1] + (b.p[1] - a.p[1]) * w];
  }

  /** Samples of one segment, roughly every `stepKm`. */
  segmentSamples(segmentId: string, stepKm: number): Sample[] {
    const range = this.ranges.get(segmentId);
    if (!range) return [];
    const out: Sample[] = [];
    for (let km = range.from; km < range.to; km += stepKm) {
      const p = this.pointAt(km);
      if (p) out.push({ km, p });
    }
    const end = this.pointAt(range.to);
    if (end) out.push({ km: range.to, p: end });
    return out;
  }
}

/** A row of the calendar: one segment, in route order. */
export interface PlanRow {
  key: string;
  segmentId: string;
  stageId: string;
  name: string;
  mode: TravelMode;
  /** The countries it crosses, in order (crossings shorter than 15 km left out). */
  countries: { code: string; name: string }[];
  fromKm: number;
  toKm: number;
  /** Where its season is judged: the middle of the segment. */
  mid: LngLat | null;
}

const MOTORISED = new Set<TravelMode>(['train', 'bus', 'boat', 'plane', 'car']);
/** Countries crossed for less than this aren't listed. */
const MIN_KM = 15;

/** One row per segment, in the route's order, with the countries it crosses (once outlines are loaded). */
export function planRows(segments: Segment[], line: RouteLine, countries: CountryIndex | null): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const seg of segments) {
    const range = line.ranges.get(seg.id);
    if (!range) continue;
    rows.push({
      key: seg.id,
      segmentId: seg.id,
      stageId: seg.stageId,
      name: seg.name,
      mode: seg.mode,
      countries: countries ? crossed(seg, line, countries, range) : [],
      fromKm: range.from,
      toKm: range.to,
      mid: line.pointAt((range.from + range.to) / 2),
    });
  }
  return rows;
}

type Country = { code: string; name: string };

function crossed(seg: Segment, line: RouteLine, countries: CountryIndex, range: { from: number; to: number }): Country[] {
  const at = (km: number) => {
    const p = line.pointAt(km);
    const c = p ? countries.at(p) : null;
    return c ? { code: c.code, name: c.name } : null;
  };
  // Trains, planes…: where they leave from and arrive.
  if (MOTORISED.has(seg.mode)) return unique([at(range.from), at(range.to)].filter((c): c is Country => !!c));
  // Runs of samples in the same country; at sea, the run carries on.
  const runs: { country: Country; from: number; to: number }[] = [];
  for (const s of line.segmentSamples(seg.id, 5)) {
    const c = countries.at(s.p);
    const last = runs.at(-1);
    if (!c) {
      if (last) last.to = s.km;
    } else if (last && last.country.code === c.code) last.to = s.km;
    else {
      if (last) last.to = s.km;
      runs.push({ country: { code: c.code, name: c.name }, from: last ? s.km : range.from, to: s.km });
    }
  }
  const long = runs.filter((r) => r.to - r.from >= MIN_KM);
  return unique((long.length ? long : runs).map((r) => r.country));
}

function unique(list: Country[]): Country[] {
  const seen = new Set<string>();
  return list.filter((c) => !seen.has(c.code) && seen.add(c.code));
}
