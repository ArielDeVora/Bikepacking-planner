import type { Coord } from './polyline';

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

type Pos = readonly [number, number, ...number[]];

/** Great-circle distance in metres. */
export function distance(a: Pos, b: Pos): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: readonly Pos[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distance(coords[i - 1]!, coords[i]!);
  return total;
}

/**
 * Points along the great circle from a to b, roughly one per `stepM` metres. Longitudes are
 * unwrapped (they may leave [-180, 180]) so the line never jumps across the antimeridian.
 */
export function greatCircle(a: Pos, b: Pos, stepM = 50_000): Coord[] {
  const [l1, p1] = [rad(a[0]), rad(a[1])];
  const [l2, p2] = [rad(b[0]), rad(b[1])];
  const d = distance(a, b) / R;
  if (d < 1e-9) return [[a[0], a[1]], [b[0], b[1]]];
  const n = Math.min(512, Math.max(2, Math.ceil((d * R) / stepM)));
  const out: Coord[] = [];
  let prevLng = a[0];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lng = i === 0 ? a[0] : i === n ? b[0] : deg(Math.atan2(y, x));
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    prevLng = lng;
    const lat = i === 0 ? a[1] : i === n ? b[1] : deg(Math.atan2(z, Math.hypot(x, y)));
    out.push([lng, lat]);
  }
  return out;
}

/**
 * Total climb and descent, ignoring changes smaller than `threshold` metres so that noise in
 * the elevation data doesn't add up.
 */
export function elevationGain(elevations: readonly number[], threshold = 5): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  let ref = elevations[0];
  if (ref === undefined) return { ascent, descent };
  for (const e of elevations) {
    if (e - ref >= threshold) {
      ascent += e - ref;
      ref = e;
    } else if (ref - e >= threshold) {
      descent += ref - e;
      ref = e;
    }
  }
  return { ascent, descent };
}

export interface ClosestPoint {
  /** Index of the vertex that starts the closest edge. */
  index: number;
  point: [number, number];
  dist: number;
}

/** Closest point on a polyline in a flat (e.g. screen) coordinate system. */
export function closestOnPolyline(points: readonly (readonly [number, number])[], p: readonly [number, number]): ClosestPoint | null {
  let best: ClosestPoint | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const dist = Math.hypot(p[0] - x, p[1] - y);
    if (!best || dist < best.dist) best = { index: i, point: [x, y], dist };
  }
  return best;
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;

/** Local metric coordinates: good enough for small distances such as simplification tolerances. */
function toMetres(c: readonly number[]): [number, number, number] {
  return [c[0]! * M_PER_DEG_LNG * Math.cos(rad(c[1]!)), c[1]! * M_PER_DEG_LAT, c[2] ?? 0];
}

function distToSegment3(p: number[], a: number[], b: number[]): number {
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
  let t = len2 ? ((p[0]! - a[0]!) * d[0]! + (p[1]! - a[1]!) * d[1]! + (p[2]! - a[2]!) * d[2]!) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0]! - (a[0]! + t * d[0]!), p[1]! - (a[1]! + t * d[1]!), p[2]! - (a[2]! + t * d[2]!));
}

/**
 * Indices of the points Douglas-Peucker keeps, in metres. With `withElevation`, elevation counts
 * as a third axis, so points carrying a change in elevation are kept too.
 */
export function simplifyIndices(pts: readonly (readonly number[])[], toleranceM: number, withElevation = true): number[] {
  if (pts.length < 3) return pts.map((_, i) => i);
  const m = pts.map((c) => {
    const v = toMetres(c);
    if (!withElevation) v[2] = 0;
    return v;
  });
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment3(m[i]!, m[first]!, m[last]!);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index >= 0 && maxD > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/** Consecutive duplicate points removed. */
export function dedupe<T extends readonly number[]>(coords: readonly T[]): T[] {
  return coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1]![0] || c[1] !== coords[i - 1]![1]);
}

/** Douglas-Peucker in 3D (see `simplifyIndices`), after dropping consecutive duplicates. */
export function simplify<T extends readonly number[]>(coords: readonly T[], toleranceM = 2): T[] {
  const pts = dedupe(coords);
  return simplifyIndices(pts, toleranceM).map((i) => pts[i]!);
}

/** Points on the straight (linear lng/lat) line from a to b, about `stepM` apart, both ends included. */
export function densify(a: Pos, b: Pos, stepM = 100, maxPoints = 2000): [number, number][] {
  const n = Math.min(maxPoints - 1, Math.max(1, Math.ceil(distance(a, b) / stepM)));
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/** Shortest distance in metres from a point to a polyline (local approximation). */
export function distanceToLine(p: Pos, coords: readonly Pos[]): number {
  const lat0 = rad(p[1]);
  const xy = (c: Pos): [number, number] => [(c[0] - p[0]) * M_PER_DEG_LNG * Math.cos(lat0), (c[1] - p[1]) * M_PER_DEG_LAT];
  if (coords.length === 1) return Math.hypot(...xy(coords[0]!));
  return closestOnPolyline(coords.map(xy), [0, 0])?.dist ?? Infinity;
}

export type BBox = [west: number, south: number, east: number, north: number];

export function bbox(coords: readonly Pos[]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of coords) {
    if (c[0] < w) w = c[0];
    if (c[0] > e) e = c[0];
    if (c[1] < s) s = c[1];
    if (c[1] > n) n = c[1];
  }
  return [w, s, e, n];
}

export const bboxOverlap = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Ray casting; the ring may be open or closed. */
export function pointInRing(p: Pos, ring: readonly Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(p: Pos, polygon: readonly (readonly Pos[])[]): boolean {
  if (!polygon[0] || !pointInRing(p, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(p, hole));
}

function cross(o: Pos, a: Pos, b: Pos): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function segmentsIntersect(a: Pos, b: Pos, c: Pos, d: Pos): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether a line enters a polygon (a vertex inside, or an edge crossing its outline). */
export function lineIntersectsPolygon(line: readonly Pos[], polygon: readonly (readonly Pos[])[]): boolean {
  const outer = polygon[0];
  if (!outer || outer.length < 3 || line.length === 0) return false;
  const pb = bbox(outer);
  if (!bboxOverlap(bbox(line), pb)) return false;
  for (const p of line) if (p[0] >= pb[0] && p[0] <= pb[2] && p[1] >= pb[1] && p[1] <= pb[3] && pointInPolygon(p, polygon)) return true;
  for (const ring of polygon) {
    for (let i = 0; i < line.length - 1; i++) {
      for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
        if (segmentsIntersect(line[i]!, line[i + 1]!, ring[k]!, ring[j]!)) return true;
      }
    }
  }
  return false;
}
