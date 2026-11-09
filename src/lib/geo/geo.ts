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
