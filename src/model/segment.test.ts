import { describe, expect, it } from 'vitest';
import { decodeLine } from '../lib/geo/polyline';
import {
  findPendingLeg,
  insertAnchor,
  makeLeg,
  moveAnchor,
  rebuildLegs,
  removeAnchor,
  replaceLeg,
  retryFailedLegs,
  segmentCoords,
} from './segment';
import type { LngLat, Segment } from './types';

type Geom = Pick<Segment, 'anchors' | 'legs' | 'geomType'>;

function build(points: LngLat[], geomType: Segment['geomType'] = 'routed'): Geom {
  let g: Geom = { anchors: [], legs: [], geomType };
  for (const p of points) g = { ...insertAnchor(g, g.anchors.length, p, `a${g.anchors.length}`), geomType };
  return g;
}

const ends = (g: Geom) => g.legs.map((l) => decodeLine(l.line)).map((c) => [c[0], c.at(-1)]);

describe('segment geometry', () => {
  it('keeps one leg per pair of anchors, pending when routed', () => {
    const g = build([[0, 0], [1, 0], [2, 0]]);
    expect(g.legs).toHaveLength(2);
    expect(g.legs.every((l) => l.status === 'pending')).toBe(true);
    expect(ends(g)).toEqual([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
    ]);
  });

  it('draws manual legs straight and plane legs as arcs', () => {
    expect(makeLeg('manual', [0, 0], [1, 1]).status).toBeUndefined();
    expect(decodeLine(makeLeg('greatCircle', [2, 49], [140, 35]).line).length).toBeGreaterThan(10);
  });

  it('inserts anchors at the start, middle and end', () => {
    let g = build([[0, 0], [2, 0]]);
    g = { ...insertAnchor(g, 1, [1, 0], 'mid'), geomType: 'routed' };
    g = { ...insertAnchor(g, 0, [-1, 0], 'first'), geomType: 'routed' };
    expect(g.anchors.map((a) => a.id)).toEqual(['first', 'a0', 'mid', 'a1']);
    expect(ends(g).map(([a, b]) => [a![0], b![0]])).toEqual([
      [-1, 0],
      [0, 1],
      [1, 2],
    ]);
  });

  it('moving an anchor redraws only its two legs', () => {
    const g = build([[0, 0], [1, 0], [2, 0], [3, 0]]);
    const routed = { ...g, legs: g.legs.map((l) => ({ line: l.line })) };
    const moved = moveAnchor(routed, 1, [1, 1]);
    expect(moved.legs.map((l) => l.status)).toEqual(['pending', 'pending', undefined]);
    expect(moved.legs[2]).toBe(routed.legs[2]);
  });

  it('removing an anchor joins its neighbours', () => {
    const g = build([[0, 0], [1, 0], [2, 0]]);
    expect(ends({ ...removeAnchor(g, 1), geomType: 'routed' })).toEqual([[[0, 0], [2, 0]]]);
    expect(removeAnchor(g, 0).legs).toHaveLength(1);
    expect(removeAnchor(g, 2).anchors.map((a) => a.id)).toEqual(['a0', 'a1']);
    expect(removeAnchor(build([[0, 0], [1, 0]]), 0).legs).toEqual([]);
  });

  it('matches routing results to the right pending leg', () => {
    const g = build([[0, 0], [1, 0], [2, 0]]);
    expect(findPendingLeg(g, [1, 0], [2, 0])).toBe(1);
    expect(findPendingLeg(g, [0, 0], [2, 0])).toBe(-1);
    const routed = replaceLeg(g, 1, { line: '3' });
    expect(findPendingLeg(routed, [1, 0], [2, 0])).toBe(-1);
  });

  it('computes stats and joins coordinates', () => {
    const g = build([[0, 0], [1, 0], [2, 0]], 'manual');
    const stats = insertAnchor(g, 3, [3, 0]).stats;
    expect(stats.lengthM).toBeCloseTo(3 * 111_195, -2);
    expect(segmentCoords(g)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it('rebuilds legs and retries failed ones', () => {
    const g = build([[0, 0], [1, 0], [2, 0]], 'manual');
    expect(rebuildLegs(g, 'routed').legs.every((l) => l.status === 'pending')).toBe(true);
    const failed = { ...g, legs: [{ line: g.legs[0]!.line, status: 'failed' as const }, g.legs[1]!] };
    expect(retryFailedLegs(failed).legs.map((l) => l.status)).toEqual(['pending', undefined]);
  });
});
