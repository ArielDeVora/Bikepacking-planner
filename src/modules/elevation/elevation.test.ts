import { describe, expect, it } from 'vitest';
import { encodeLine } from '../../lib/geo/polyline';
import type { Leg, Segment } from '../../model/types';
import { buildProfile, eleAt, gradeAt, gradeColor, indexAt, positionAt } from './profile';
import { applyTerrain, terrainJobs } from './terrain';

const seg = (mode: Segment['mode'], legs: Leg[]): Segment =>
  ({ id: 's', type: 'segment', mode, legs, anchors: [], geomType: 'manual' }) as unknown as Segment;

describe('terrain jobs', () => {
  it('picks 2D legs of bike and walk segments, densifying straight ones', () => {
    const straight = { line: encodeLine([[7, 45], [7.01, 45]]) };
    const routed = { line: encodeLine([[7, 45, 100], [7.01, 45, 120]]) };
    const pending = { line: straight.line, status: 'pending' as const };
    const jobs = terrainJobs(seg('bike', [straight, routed, pending]));
    expect(jobs.map((j) => j.index)).toEqual([0]);
    expect(jobs[0]!.points.length).toBeGreaterThan(5);
    expect(terrainJobs(seg('train', [straight]))).toEqual([]);
  });

  it('writes sampled elevation, filling gaps, unless the leg changed', () => {
    const s = seg('bike', [{ line: encodeLine([[7, 45], [7.001, 45], [7.002, 45]]), status: 'failed' }]);
    const [job] = terrainJobs(s);
    const out = applyTerrain(s, job!, [NaN, 500, 520]);
    expect(out!.legs[0]!.status).toBe('failed');
    expect(out!.stats.ascentM).toBe(20);
    expect(applyTerrain({ ...s, legs: [{ line: 'x' }] }, job!, [1, 2, 3])).toBeNull();
    expect(applyTerrain(s, job!, [NaN, NaN, NaN])).toBeNull();
  });
});

describe('profile', () => {
  const a = seg('bike', [{ line: encodeLine([[7, 45, 100], [7.01, 45, 150], [7.02, 45, 120]]) }]);
  const flight = seg('bike', [{ line: encodeLine([[8, 45], [9, 45]]) }]);

  it('concatenates segments and sums climbs over known elevation only', () => {
    const p = buildProfile([a, flight]);
    expect(p.d.length).toBe(5);
    expect(p.lengthM).toBeCloseTo(1573 + 78_700, -3);
    expect(p.d[3]).toBe(p.d[2]);
    expect(Number.isNaN(p.e[4]!)).toBe(true);
    expect([p.ascentM, p.descentM, p.minEle, p.maxEle]).toEqual([50, 30, 100, 150]);
    expect(p.ranges.map((r) => [r.from, Math.round(r.to)])).toEqual([
      [0, Math.round(p.d[2]!)],
      [p.d[2], Math.round(p.lengthM)],
    ]);
  });

  it('does not count the step between separate segments as climb', () => {
    const b = seg('bike', [{ line: encodeLine([[7.5, 45, 900], [7.51, 45, 910]]) }]);
    expect(buildProfile([a, b]).ascentM).toBe(50 + 10);
  });

  it('interpolates along the profile', () => {
    const p = buildProfile([a]);
    const mid = p.d[1]! / 2;
    expect(indexAt(p, mid)).toBe(0);
    expect(eleAt(p, mid)).toBeCloseTo(125, 5);
    expect(positionAt(p, mid)[0]).toBeCloseTo(7.005, 5);
    expect(gradeAt(p, 0, p.d[1]!)).toBeCloseTo((50 / p.d[1]!) * 100, 3);
    expect(gradeColor(2)).toBe('#8ce99a');
    expect(gradeColor(-15)).toBe('#c92a2a');
  });
});
