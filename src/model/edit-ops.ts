import { dedupe, distance, lineLength, simplifyIndices } from '../lib/geo/geo';
import { encodeLine, type Coord } from '../lib/geo/polyline';
import { newId } from './ids';
import { computeStats, legCoords, makeLeg, rebuildLegs, segmentCoords, type SegmentGeometry } from './segment';
import type { Anchor, Leg, LngLat, Segment } from './types';

type Geom = Pick<Segment, 'anchors' | 'legs' | 'geomType'>;

/** Positions closer than this to an anchor or an end snap to it. */
const SNAP_M = 1;

const geometry = (anchors: Anchor[], legs: Leg[]): SegmentGeometry => ({ anchors, legs, stats: computeStats(legs) });

export function segmentLength(seg: Pick<Segment, 'legs'>): number {
  return seg.legs.reduce((sum, leg) => sum + lineLength(legCoords(leg)), 0);
}

/** Distance along the segment (as in its elevation profile) of the point closest to `p`. */
export function distanceAlong(seg: Pick<Segment, 'legs'>, p: LngLat): number {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_574;
  let best = Infinity;
  let along = 0;
  let cum = 0;
  for (const leg of seg.legs) {
    const c = legCoords(leg);
    for (let i = 0; i < c.length - 1; i++) {
      const ax = (c[i]![0] - p[0]) * kx;
      const ay = (c[i]![1] - p[1]) * ky;
      const dx = (c[i + 1]![0] - c[i]![0]) * kx;
      const dy = (c[i + 1]![1] - c[i]![1]) * ky;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      const edge = distance(c[i]!, c[i + 1]!);
      if (d < best) {
        best = d;
        along = cum + t * edge;
      }
      cum += edge;
    }
  }
  return along;
}

function lerp(a: Coord, b: Coord, f: number): Coord {
  const lng = a[0] + (b[0] - a[0]) * f;
  const lat = a[1] + (b[1] - a[1]) * f;
  return a.length === 3 && b.length === 3 ? [lng, lat, a[2] + (b[2] - a[2]) * f] : [lng, lat];
}

/**
 * Splits at a distance along the segment. A position within a metre of an anchor splits there;
 * otherwise the leg is cut and a new anchor added. Null at (or beyond) either end.
 */
export function splitAt(seg: Geom, distM: number): [SegmentGeometry, SegmentGeometry] | null {
  const total = segmentLength(seg);
  if (distM <= SNAP_M || distM >= total - SNAP_M) return null;
  let cum = 0;
  for (let L = 0; L < seg.legs.length; L++) {
    const leg = seg.legs[L]!;
    const coords = legCoords(leg);
    const legLen = lineLength(coords);
    const end = cum + legLen;
    if (Math.abs(distM - end) <= SNAP_M && L < seg.legs.length - 1) {
      const i = L + 1;
      return [
        geometry(seg.anchors.slice(0, i + 1), seg.legs.slice(0, i)),
        geometry([{ ...seg.anchors[i]!, id: newId() }, ...seg.anchors.slice(i + 1)], seg.legs.slice(i)),
      ];
    }
    if (distM < end) {
      let walked = cum;
      for (let k = 0; k < coords.length - 1; k++) {
        const edge = distance(coords[k]!, coords[k + 1]!);
        if (distM <= walked + edge || k === coords.length - 2) {
          const p = lerp(coords[k]!, coords[k + 1]!, edge ? Math.min(1, (distM - walked) / edge) : 0);
          const lngLat: LngLat = [p[0], p[1]];
          const part1 = dedupe([...coords.slice(0, k + 1), p]);
          const part2 = dedupe([p, ...coords.slice(k + 1)]);
          const [leg1, leg2]: Leg[] =
            leg.status === 'pending'
              ? [makeLeg(seg.geomType, seg.anchors[L]!.lngLat, lngLat), makeLeg(seg.geomType, lngLat, seg.anchors[L + 1]!.lngLat)]
              : [part1, part2].map((part) => ({ line: encodeLine(part), ...(leg.status ? { status: leg.status } : {}) }));
          return [
            geometry([...seg.anchors.slice(0, L + 1), { id: newId(), lngLat }], [...seg.legs.slice(0, L), leg1!]),
            geometry([{ id: newId(), lngLat }, ...seg.anchors.slice(L + 1)], [leg2!, ...seg.legs.slice(L + 1)]),
          ];
        }
        walked += edge;
      }
    }
    cum = end;
  }
  return null;
}

/** What remains after removing the part between two distances: a head, a tail, both or neither. */
export function eraseRange(seg: Geom, fromM: number, toM: number): { head: SegmentGeometry | null; tail: SegmentGeometry | null } {
  const total = segmentLength(seg);
  const from = Math.max(0, Math.min(fromM, toM));
  const to = Math.min(total, Math.max(fromM, toM));
  let head: SegmentGeometry | null = null;
  let rest: Geom = seg;
  if (from > SNAP_M) {
    const parts = splitAt(seg, from);
    if (parts) {
      head = parts[0];
      rest = { ...parts[1], geomType: seg.geomType };
    }
  }
  let tail: SegmentGeometry | null = null;
  if (to < total - SNAP_M) tail = splitAt(rest, to - from)?.[1] ?? null;
  return { head, tail };
}

/**
 * The segment with the part between two distances replaced by `path` (e.g. that stretch of
 * another segment's line), joined to the rest by short legs where they don't touch.
 */
export function replaceRange(seg: Geom, fromM: number, toM: number, path: Coord[]): SegmentGeometry | null {
  const pts = dedupe(path);
  if (pts.length < 2) return null;
  const { head, tail } = eraseRange(seg, fromM, toM);
  const ends = [pts[0]!, pts.at(-1)!].map((c): Anchor => ({ id: newId(), lngLat: [c[0], c[1]] }));
  let out: Geom = { anchors: ends, legs: [{ line: encodeLine(pts) }], geomType: seg.geomType };
  if (head) out = { ...mergeGeometry({ ...head, geomType: seg.geomType }, out), geomType: seg.geomType };
  if (tail) out = { ...mergeGeometry(out, { ...tail, geomType: seg.geomType }), geomType: seg.geomType };
  return geometry(out.anchors, out.legs);
}

/** `b` appended to `a`; joined by a new leg (in `a`'s geometry type) unless they already touch. */
export function mergeGeometry(a: Geom, b: Geom): SegmentGeometry {
  const aEnd = a.anchors.at(-1)?.lngLat;
  const bStart = b.anchors[0]?.lngLat;
  if (!aEnd || !bStart) return geometry([...a.anchors, ...b.anchors], [...a.legs, ...b.legs]);
  if (aEnd[0] === bStart[0] && aEnd[1] === bStart[1]) {
    return geometry([...a.anchors, ...b.anchors.slice(1)], [...a.legs, ...b.legs]);
  }
  const bridge = makeLeg(a.geomType === 'imported' ? 'manual' : a.geomType, aEnd, bStart);
  return geometry([...a.anchors, ...b.anchors], [...a.legs, bridge, ...b.legs]);
}

/** The other way round. Routed segments are routed again, since roads can be one-way. */
export function reverseGeometry(seg: Geom): SegmentGeometry {
  const anchors = [...seg.anchors].reverse();
  if (seg.geomType === 'routed') return rebuildLegs({ anchors }, 'routed');
  const legs = [...seg.legs].reverse().map((leg) => ({
    line: encodeLine([...legCoords(leg)].reverse()),
    ...(leg.status ? { status: leg.status } : {}),
  }));
  return geometry(anchors, legs);
}

/**
 * Anchors for an imported track, at its main bends, so it can be edited like a drawn segment.
 * The geometry between anchors is kept as it is.
 */
export function editableGeometry(seg: Pick<Segment, 'legs'>): SegmentGeometry {
  const coords = dedupe(segmentCoords(seg));
  if (coords.length < 2) return geometry([], []);
  const toleranceM = Math.min(200, Math.max(15, lineLength(coords) / 400));
  const idx = simplifyIndices(coords, toleranceM, false);
  const anchors = idx.map((i) => ({ id: newId(), lngLat: [coords[i]![0], coords[i]![1]] as LngLat }));
  const legs = idx.slice(1).map((j, k) => ({ line: encodeLine(coords.slice(idx[k], j + 1)) }));
  return geometry(anchors, legs);
}

/** Same geometry, new anchor ids. */
export function copyGeometry(seg: Pick<Segment, 'anchors' | 'legs' | 'stats'>): SegmentGeometry {
  return { anchors: seg.anchors.map((a) => ({ ...a, id: newId() })), legs: seg.legs, stats: seg.stats };
}

/** The segment's line between two distances along it (for highlighting a range). */
export function sliceLine(seg: Pick<Segment, 'legs'>, fromM: number, toM: number): Coord[] {
  const from = Math.min(fromM, toM);
  const to = Math.max(fromM, toM);
  const out: Coord[] = [];
  let cum = 0;
  for (const leg of seg.legs) {
    const c = legCoords(leg);
    for (let i = 0; i < c.length - 1; i++) {
      const edge = distance(c[i]!, c[i + 1]!);
      const a = cum;
      const b = cum + edge;
      cum = b;
      if (b < from || a > to || edge === 0) continue;
      if (!out.length) out.push(lerp(c[i]!, c[i + 1]!, Math.max(0, (from - a) / edge)));
      if (b <= to) out.push(c[i + 1]!);
      else {
        out.push(lerp(c[i]!, c[i + 1]!, (to - a) / edge));
        return out;
      }
    }
  }
  return out;
}
