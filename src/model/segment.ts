import { elevationGain, greatCircle, lineLength, simplify } from '../lib/geo/geo';
import { decodeLine, encodeLine, type Coord } from '../lib/geo/polyline';
import { newId } from './ids';
import type { Anchor, GeometryType, Leg, LngLat, Segment, SegmentStats } from './types';

/** The parts of a segment that anchor edits change. */
export type SegmentGeometry = Pick<Segment, 'anchors' | 'legs' | 'stats'>;

type GeomSource = Pick<Segment, 'anchors' | 'legs' | 'geomType'>;

/** The leg drawn between two anchors before any routing: straight, or a great-circle arc. */
export function makeLeg(geomType: GeometryType, a: LngLat, b: LngLat): Leg {
  if (geomType === 'greatCircle') return { line: encodeLine(greatCircle(a, b)) };
  const line = encodeLine([
    [a[0], a[1]],
    [b[0], b[1]],
  ]);
  return geomType === 'routed' ? { line, status: 'pending' } : { line };
}

const decoded = new WeakMap<Leg, Coord[]>();

/** Decoded leg coordinates, cached per leg object. Treat the result as read-only. */
export function legCoords(leg: Leg): Coord[] {
  let coords = decoded.get(leg);
  if (!coords) decoded.set(leg, (coords = decodeLine(leg.line)));
  return coords;
}

/** All legs joined into one line. */
export function segmentCoords(seg: Pick<Segment, 'legs'>): Coord[] {
  const out: Coord[] = [];
  for (const leg of seg.legs) {
    const coords = legCoords(leg);
    for (let i = out.length ? 1 : 0; i < coords.length; i++) out.push(coords[i]!);
  }
  return out;
}

export function computeStats(legs: Leg[]): SegmentStats {
  let lengthM = 0;
  const elevations: number[] = [];
  for (const leg of legs) {
    const coords = legCoords(leg);
    lengthM += lineLength(coords);
    for (const c of coords) if (c.length === 3) elevations.push(c[2]);
  }
  const { ascent, descent } = elevationGain(elevations);
  return { lengthM: Math.round(lengthM), ascentM: Math.round(ascent), descentM: Math.round(descent) };
}

const geometry = (anchors: Anchor[], legs: Leg[]): SegmentGeometry => ({ anchors, legs, stats: computeStats(legs) });

/** Inserts an anchor at `index` (0 = new start, anchors.length = new end). */
export function insertAnchor(seg: GeomSource, index: number, lngLat: LngLat, id = newId()): SegmentGeometry {
  const old = seg.anchors;
  const i = Math.max(0, Math.min(index, old.length));
  const anchors = [...old.slice(0, i), { id, lngLat }, ...old.slice(i)];
  const legs = [...seg.legs];
  if (old.length > 0) {
    if (i === 0) legs.unshift(makeLeg(seg.geomType, lngLat, old[0]!.lngLat));
    else if (i === old.length) legs.push(makeLeg(seg.geomType, old[i - 1]!.lngLat, lngLat));
    else
      legs.splice(i - 1, 1, makeLeg(seg.geomType, old[i - 1]!.lngLat, lngLat), makeLeg(seg.geomType, lngLat, old[i]!.lngLat));
  }
  return geometry(anchors, legs);
}

export function moveAnchor(seg: GeomSource, index: number, lngLat: LngLat): SegmentGeometry {
  const anchors = seg.anchors.map((a, i) => (i === index ? { ...a, lngLat } : a));
  const legs = [...seg.legs];
  if (index > 0) legs[index - 1] = makeLeg(seg.geomType, anchors[index - 1]!.lngLat, lngLat);
  if (index < anchors.length - 1) legs[index] = makeLeg(seg.geomType, lngLat, anchors[index + 1]!.lngLat);
  return geometry(anchors, legs);
}

export function removeAnchor(seg: GeomSource, index: number): SegmentGeometry {
  const old = seg.anchors;
  const anchors = old.filter((_, i) => i !== index);
  const legs = [...seg.legs];
  if (anchors.length < 2) return geometry(anchors, []);
  if (index === 0) legs.shift();
  else if (index === old.length - 1) legs.pop();
  else legs.splice(index - 1, 2, makeLeg(seg.geomType, old[index - 1]!.lngLat, old[index + 1]!.lngLat));
  return geometry(anchors, legs);
}

/**
 * Legs matching a segment's anchors, after its anchors were set without them (e.g. restored from
 * the history, which doesn't keep drawn lines): a leg between the same two points as before is
 * kept as it was; the others are drawn again (routed ones get routed again).
 */
export function realignLegs(seg: Pick<Segment, 'anchors' | 'geomType'>, previous: Pick<Segment, 'anchors' | 'legs'> | undefined): SegmentGeometry {
  const key = (a: LngLat, b: LngLat) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const known = new Map<string, Leg>();
  if (previous) previous.legs.forEach((leg, i) => {
    const a = previous.anchors[i];
    const b = previous.anchors[i + 1];
    if (a && b) known.set(key(a.lngLat, b.lngLat), leg);
  });
  const legs = seg.anchors.slice(1).map((b, i) => {
    const a = seg.anchors[i]!.lngLat;
    return known.get(key(a, b.lngLat)) ?? makeLeg(seg.geomType, a, b.lngLat);
  });
  return geometry(seg.anchors, legs);
}

/** Redraws every leg for a new geometry type (routed legs become pending). */
export function rebuildLegs(seg: Pick<Segment, 'anchors'>, geomType: GeometryType): SegmentGeometry {
  const legs = seg.anchors.slice(1).map((a, i) => makeLeg(geomType, seg.anchors[i]!.lngLat, a.lngLat));
  return geometry(seg.anchors, legs);
}

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

/**
 * Index of the pending leg that runs from `from` to `to`, or -1 if the segment no longer has
 * one (it was edited or undone in the meantime).
 */
export function findPendingLeg(seg: Pick<Segment, 'anchors' | 'legs'>, from: LngLat, to: LngLat): number {
  return seg.legs.findIndex(
    (leg, i) => leg.status === 'pending' && same(seg.anchors[i]!.lngLat, from) && same(seg.anchors[i + 1]!.lngLat, to),
  );
}

export function replaceLeg(seg: Pick<Segment, 'anchors' | 'legs'>, index: number, leg: Leg): SegmentGeometry {
  return geometry(
    seg.anchors,
    seg.legs.map((l, i) => (i === index ? leg : l)),
  );
}

/** Marks failed legs as pending again so the router retries them. */
export function retryFailedLegs(seg: Pick<Segment, 'anchors' | 'legs'>): SegmentGeometry {
  return geometry(
    seg.anchors,
    seg.legs.map((l) => (l.status === 'failed' ? { line: l.line, status: 'pending' as const } : l)),
  );
}

/**
 * Geometry for an imported track. Each part (e.g. a GPX `trkseg`) becomes one leg, simplified
 * to within `toleranceM`; gaps between parts are bridged by straight legs.
 */
export function importedGeometry(parts: Coord[][], toleranceM = 2): SegmentGeometry {
  const anchors: Anchor[] = [];
  const legs: Leg[] = [];
  for (const raw of parts) {
    const part = simplify(raw, toleranceM);
    if (part.length < 2) continue;
    const start: LngLat = [part[0]![0], part[0]![1]];
    const prev = anchors.at(-1);
    if (!prev) anchors.push({ id: newId(), lngLat: start });
    else if (prev.lngLat[0] !== start[0] || prev.lngLat[1] !== start[1]) {
      legs.push(makeLeg('manual', prev.lngLat, start));
      anchors.push({ id: newId(), lngLat: start });
    }
    legs.push({ line: encodeLine(part) });
    const end = part.at(-1)!;
    anchors.push({ id: newId(), lngLat: [end[0], end[1]] });
  }
  return geometry(anchors, legs);
}
