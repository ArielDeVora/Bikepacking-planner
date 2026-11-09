import { MODES } from '../../config/modes';
import { densify } from '../../lib/geo/geo';
import { encodeLine } from '../../lib/geo/polyline';
import { legCoords, replaceLeg, type SegmentGeometry } from '../../model/segment';
import type { Segment } from '../../model/types';

/** Spacing of elevation samples along straight legs. */
const STEP_M = 100;

export interface TerrainJob {
  index: number;
  /** The leg's encoded line when the job was planned; the result is dropped if it changed. */
  line: string;
  points: [number, number][];
}

/** Legs of the segment that have no elevation and should get it from terrain data. */
export function terrainJobs(seg: Segment): TerrainJob[] {
  if (!MODES[seg.mode].terrain) return [];
  const jobs: TerrainJob[] = [];
  seg.legs.forEach((leg, index) => {
    if (leg.status === 'pending') return;
    const coords = legCoords(leg);
    if (coords.length < 2 || coords.every((c) => c.length === 3)) return;
    const points =
      coords.length === 2 ? densify(coords[0]!, coords[1]!, STEP_M) : coords.map((c) => [c[0], c[1]] as [number, number]);
    jobs.push({ index, line: leg.line, points });
  });
  return jobs;
}

/**
 * The segment with the job's leg replaced by the sampled 3D line, or null if the leg changed in
 * the meantime or no elevation could be found. Missing samples take the nearest known value.
 */
export function applyTerrain(seg: Segment, job: TerrainJob, elevations: number[]): SegmentGeometry | null {
  const leg = seg.legs[job.index];
  if (!leg || leg.line !== job.line) return null;
  if (!elevations.some(Number.isFinite)) return null;
  const filled = [...elevations];
  let last = filled.find(Number.isFinite)!;
  for (let i = 0; i < filled.length; i++) {
    if (Number.isFinite(filled[i])) last = filled[i]!;
    else filled[i] = last;
  }
  const line = encodeLine(job.points.map((p, i) => [p[0], p[1], filled[i]!]));
  return replaceLeg(seg, job.index, leg.status ? { line, status: leg.status } : { line });
}
