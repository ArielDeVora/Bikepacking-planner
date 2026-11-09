import type { TripStore } from '../../core/store';
import { segmentCoords } from '../../model/segment';
import type { LngLat, Segment } from '../../model/types';
import { distanceToLine } from '../geo/geo';

/** The segment closest to a point, and how far it is (planes and boats excluded). */
export function nearestSegment(store: TripStore, p: LngLat): { segment: Segment; distM: number } | null {
  let best: { segment: Segment; distM: number } | null = null;
  for (const segment of store.list('segment')) {
    if (segment.mode === 'plane' || segment.mode === 'boat') continue;
    const coords = segmentCoords(segment);
    if (coords.length < 2) continue;
    // Skip segments whose bounding box is clearly farther than the best so far.
    if (best) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const c of coords) {
        if (c[0] < minLng) minLng = c[0];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      }
      const dLat = Math.max(0, minLat - p[1], p[1] - maxLat) * 110_574;
      const dLng = Math.max(0, minLng - p[0], p[0] - maxLng) * 111_320 * Math.cos((p[1] * Math.PI) / 180);
      if (Math.hypot(dLat, dLng) > best.distM) continue;
    }
    const distM = distanceToLine(p, coords);
    if (!best || distM < best.distM) best = { segment, distM };
  }
  return best;
}
