import { describe, expect, it } from 'vitest';
import { decodeLine, encodeLine, type Coord } from '../lib/geo/polyline';
import {
  copyGeometry,
  distanceAlong,
  editableGeometry,
  eraseRange,
  mergeGeometry,
  replaceRange,
  reverseGeometry,
  segmentLength,
  sliceLine,
  splitAt,
} from './edit-ops';
import { computeStats } from './segment';
import type { Leg, LngLat, Segment } from './types';

type Geom = Pick<Segment, 'anchors' | 'legs' | 'geomType'>;

/** A segment along the equator-ish line lat 45 with routed legs between the given longitudes. */
function seg(lngs: number[], geomType: Segment['geomType'] = 'routed', pointsPerLeg = 5): Geom & Pick<Segment, 'stats'> {
  const anchors = lngs.map((lng, i) => ({ id: `a${i}`, lngLat: [lng, 45] as LngLat }));
  const legs: Leg[] = lngs.slice(1).map((lng, i) => {
    const a = lngs[i]!;
    const coords: Coord[] = Array.from({ length: pointsPerLeg }, (_, k) => [a + ((lng - a) * k) / (pointsPerLeg - 1), 45, 100 + k]);
    return { line: encodeLine(coords) };
  });
  return { anchors, legs, geomType, stats: computeStats(legs) };
}

const ends = (g: Pick<Segment, 'legs'>) => g.legs.map((l) => decodeLine(l.line)).map((c) => [c[0]![0], c.at(-1)![0]]);
const lngs = (g: Pick<Segment, 'anchors'>) => g.anchors.map((a) => a.lngLat[0]);

describe('segment edits', () => {
  const s = seg([7, 7.01, 7.02]);
  const legLen = segmentLength(s) / 2;

  it('measures distance along the segment', () => {
    expect(distanceAlong(s, [7.005, 45.001])).toBeCloseTo(legLen / 2, -1);
    expect(distanceAlong(s, [6.9, 45])).toBe(0);
  });

  it('splits inside a leg, adding an anchor on both sides', () => {
    const [a, b] = splitAt(s, legLen / 2)!;
    expect(lngs(a)[0]).toBe(7);
    expect(lngs(a).at(-1)).toBeCloseTo(7.005, 4);
    expect(lngs(b)[0]).toBeCloseTo(7.005, 4);
    expect(lngs(b).slice(1)).toEqual([7.01, 7.02]);
    expect(a.anchors.at(-1)!.id).not.toBe(b.anchors[0]!.id);
    expect(ends(a)[0]![1]).toBeCloseTo(7.005, 4);
    expect(b.legs).toHaveLength(2);
    expect(a.stats.lengthM + b.stats.lengthM).toBeCloseTo(s.stats.lengthM, -1);
    expect(decodeLine(a.legs[0]!.line)[0]!.length).toBe(3);
  });

  it('splits at an anchor without cutting legs', () => {
    const [a, b] = splitAt(s, legLen + 0.5)!;
    expect(lngs(a)).toEqual([7, 7.01]);
    expect(lngs(b)).toEqual([7.01, 7.02]);
    expect(a.legs[0]).toBe(s.legs[0]);
    expect(b.legs[0]).toBe(s.legs[1]);
  });

  it('does not split at the ends', () => {
    expect(splitAt(s, 0)).toBeNull();
    expect(splitAt(s, segmentLength(s))).toBeNull();
  });

  it('keeps pending legs pending when cut', () => {
    const pending = { ...s, legs: s.legs.map((l) => ({ ...l, status: 'pending' as const })) };
    const [a, b] = splitAt(pending, legLen / 2)!;
    expect(a.legs.at(-1)!.status).toBe('pending');
    expect(b.legs[0]!.status).toBe('pending');
  });

  it('erases the middle, a head or a tail', () => {
    const total = segmentLength(s);
    const mid = eraseRange(s, total * 0.25, total * 0.75);
    expect(lngs(mid.head!).at(-1)).toBeCloseTo(7.005, 3);
    expect(lngs(mid.tail!)[0]).toBeCloseTo(7.015, 3);
    const start = eraseRange(s, 0, total / 2);
    expect(start.head).toBeNull();
    expect(lngs(start.tail!)).toEqual([7.01, 7.02]);
    const end = eraseRange(s, total, total * 0.75);
    expect(end.tail).toBeNull();
    expect(lngs(end.head!).at(-1)).toBeCloseTo(7.015, 3);
    expect(eraseRange(s, 0, total)).toEqual({ head: null, tail: null });
  });

  it('merges, bridging a gap only when needed', () => {
    const touching = mergeGeometry(seg([7, 7.01]), seg([7.01, 7.02]));
    expect(lngs(touching)).toEqual([7, 7.01, 7.02]);
    expect(touching.legs).toHaveLength(2);
    const apart = mergeGeometry(seg([7, 7.01]), seg([7.02, 7.03]));
    expect(lngs(apart)).toEqual([7, 7.01, 7.02, 7.03]);
    expect(apart.legs.map((l) => l.status)).toEqual([undefined, 'pending', undefined]);
    expect(mergeGeometry(seg([7, 7.01], 'imported'), seg([7.02, 7.03])).legs[1]!.status).toBeUndefined();
  });

  it('reverses: routed legs are routed again, others are flipped', () => {
    const routed = reverseGeometry(s);
    expect(lngs(routed)).toEqual([7.02, 7.01, 7]);
    expect(routed.legs.every((l) => l.status === 'pending')).toBe(true);
    const imported = reverseGeometry({ ...s, geomType: 'imported' });
    expect(ends(imported)).toEqual([
      [7.02, 7.01],
      [7.01, 7],
    ]);
    expect(imported.stats.ascentM).toBe(s.stats.descentM);
  });

  it('turns a track into anchors at its bends, keeping the geometry', () => {
    const coords: Coord[] = [];
    for (let i = 0; i <= 50; i++) coords.push([7 + i * 0.0002, 45, 500]);
    for (let i = 1; i <= 50; i++) coords.push([7.01, 45 + i * 0.0002, 500]);
    const g = editableGeometry({ legs: [{ line: encodeLine(coords) }] });
    expect(g.anchors.map((a) => a.lngLat)).toEqual([
      [7, 45],
      [7.01, 45],
      [7.01, 45.01],
    ]);
    expect(decodeLine(g.legs[0]!.line)).toHaveLength(51);
    expect(decodeLine(g.legs[1]!.line)).toHaveLength(51);
  });

  it('slices the line between two distances', () => {
    const total = segmentLength(s);
    const part = sliceLine(s, total * 0.25, total * 0.75);
    expect(part[0]![0]).toBeCloseTo(7.005, 4);
    expect(part.at(-1)![0]).toBeCloseTo(7.015, 4);
    expect(part.some((c) => c[0] === 7.01)).toBe(true);
    expect(sliceLine(s, total * 0.75, total * 0.25)).toEqual(part);
  });

  it('copies with fresh anchor ids', () => {
    const c = copyGeometry(s);
    expect(c.legs).toBe(s.legs);
    expect(c.anchors.map((a) => a.id)).not.toEqual(s.anchors.map((a) => a.id));
  });
});

describe('following another segment', () => {
  it('replaces a stretch with a path, joined to the rest', () => {
    const a = seg([0, 1, 2], 'imported');
    const total = segmentLength(a);
    // A detour north of the middle stretch.
    const path: Coord[] = [[0.5, 45], [0.75, 45.2], [1.25, 45.2], [1.5, 45]];
    const out = replaceRange(a, total / 4, (total * 3) / 4, path)!;
    expect(lngs(out)[0]).toBe(0);
    expect(lngs(out).at(-1)).toBe(2);
    const coords = out.legs.flatMap((l) => decodeLine(l.line));
    expect(coords.some((c) => c[1] > 45.1)).toBe(true);
    expect(out.stats.lengthM).toBeGreaterThan(a.stats.lengthM);
  });

  it('replaces from the start or to the end too', () => {
    const a = seg([0, 2], 'manual');
    const total = segmentLength(a);
    const head = replaceRange(a, 0, total / 2, [[0, 45.1], [1, 45.1]])!;
    expect(lngs(head)[0]).toBe(0);
    expect(head.anchors[0]!.lngLat[1]).toBe(45.1);
    expect(replaceRange(a, 0, total, [[0, 45]])).toBeNull();
  });
});
