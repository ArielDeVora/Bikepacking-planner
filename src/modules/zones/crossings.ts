import { lineIntersectsPolygon } from '../../lib/geo/geo';
import { legCoords, makeLeg, segmentCoords, type SegmentGeometry } from '../../model/segment';
import { computeStats } from '../../model/segment';
import type { Segment, Zone } from '../../model/types';

/** Avoid zones the segment's line enters. */
export function zonesCrossed(seg: Segment, zones: Zone[]): Zone[] {
  const line = segmentCoords(seg);
  return zones.filter((z) => z.kind === 'avoid' && lineIntersectsPolygon(line, z.polygon));
}

/** Risk zones the segment's line enters. */
export function riskZonesCrossed(seg: Segment, zones: Zone[]): Zone[] {
  const line = segmentCoords(seg);
  return zones.filter((z) => z.kind === 'risk' && lineIntersectsPolygon(line, z.polygon));
}

/** Segments that enter the zone. */
export function segmentsCrossing(zone: Zone, segments: Segment[]): Segment[] {
  return segments.filter((s) => lineIntersectsPolygon(segmentCoords(s), zone.polygon));
}

/**
 * The legs of a routed segment that enter one of the zones, sent back to the router (which
 * avoids no-go zones). Null if no leg needs it.
 */
export function rerouteThrough(seg: Segment, zones: Zone[]): SegmentGeometry | null {
  if (seg.geomType !== 'routed') return null;
  let changed = false;
  const legs = seg.legs.map((leg, i) => {
    if (!zones.some((z) => lineIntersectsPolygon(legCoords(leg), z.polygon))) return leg;
    changed = true;
    return makeLeg('routed', seg.anchors[i]!.lngLat, seg.anchors[i + 1]!.lngLat);
  });
  return changed ? { anchors: seg.anchors, legs, stats: computeStats(legs) } : null;
}
