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

/** A row of the calendar: a segment, or the part of it in one country. */
export interface PlanRow {
  key: string;
  segmentId: string;
  stageId: string;
  name: string;
  mode: TravelMode;
  country: { code: string; name: string } | null;
  fromKm: number;
  toKm: number;
  /** Where its season is judged: the middle of the part. */
  mid: LngLat | null;
}

const MOTORISED = new Set<TravelMode>(['train', 'bus', 'boat', 'plane', 'car']);
/** Countries crossed for less than this are folded into their neighbours. */
const MIN_KM = 15;

/**
 * One row per segment and country it crosses (bike and walk segments), or per segment (others,
 * with the country they arrive in). Without country outlines, one row per segment.
 */
export function planRows(segments: Segment[], line: RouteLine, countries: CountryIndex | null): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const seg of segments) {
    const range = line.ranges.get(seg.id);
    if (!range) continue;
    const base = { segmentId: seg.id, stageId: seg.stageId, name: seg.name, mode: seg.mode };
    const whole = (country: PlanRow['country']) =>
      rows.push({ ...base, key: seg.id, country, fromKm: range.from, toKm: range.to, mid: line.pointAt((range.from + range.to) / 2) });

    if (!countries) {
      whole(null);
      continue;
    }
    if (MOTORISED.has(seg.mode)) {
      const end = line.pointAt(range.to);
      const c = end ? countries.at(end) : null;
      whole(c ? { code: c.code, name: c.name } : null);
      continue;
    }

    // Runs of samples in the same country; at sea, the run carries on.
    const runs: { country: PlanRow['country']; from: number; to: number }[] = [];
    for (const s of line.segmentSamples(seg.id, 5)) {
      const c = countries.at(s.p);
      const last = runs.at(-1);
      if (!c) {
        if (last) last.to = s.km;
        continue;
      }
      if (last && last.country?.code === c.code) last.to = s.km;
      else {
        if (last) last.to = s.km;
        runs.push({ country: { code: c.code, name: c.name }, from: last ? s.km : range.from, to: s.km });
      }
    }
    // Short crossings join the run before them (or after, at the start).
    const merged: typeof runs = [];
    for (const run of runs) {
      const prev = merged.at(-1);
      if (prev && run.to - run.from < MIN_KM) prev.to = run.to;
      else if (prev && prev.country?.code === run.country?.code) prev.to = run.to;
      else merged.push({ ...run });
    }
    if (merged.length > 1 && merged[0]!.to - merged[0]!.from < MIN_KM) {
      merged[1]!.from = merged[0]!.from;
      merged.shift();
    }
    if (!merged.length) {
      whole(null);
      continue;
    }
    merged[0]!.from = range.from;
    merged.at(-1)!.to = range.to;
    merged.forEach((run, i) =>
      rows.push({
        ...base,
        key: merged.length > 1 ? `${seg.id}:${i}` : seg.id,
        country: run.country,
        fromKm: run.from,
        toKm: run.to,
        mid: line.pointAt((run.from + run.to) / 2),
      }),
    );
  }
  return rows;
}
