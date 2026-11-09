import type { TripStore } from '../../core/store';
import { distanceToLine } from '../../lib/geo/geo';
import { groupSegments, stageSegments, tripSegments } from '../../lib/tree';
import { segmentCoords } from '../../model/segment';
import type { Segment, Stage } from '../../model/types';
import { toGpx, type GpxTrack, type GpxWaypoint } from './gpx';

/** POIs within this distance of an exported stage or segment go into its GPX. */
const NEARBY_M = 1000;

const ACTIVE_MODES = new Set(['bike', 'walk']);

const track = (seg: Segment, stage: Stage | undefined): GpxTrack => ({
  name: seg.name,
  desc: stage?.name,
  type: seg.mode,
  coords: segmentCoords(seg),
});

function waypoints(store: TripStore, tracks: GpxTrack[] | null): GpxWaypoint[] {
  return store
    .list('poi')
    .filter((p) => !tracks || tracks.some((tr) => distanceToLine(p.lngLat, tr.coords) <= NEARBY_M))
    .map((p) => ({ name: p.name, desc: p.notes, lngLat: p.lngLat, links: p.links }));
}

export function tripGpx(store: TripStore, tripId: string, activeOnly: boolean): { name: string; xml: string } {
  const name = store.get(tripId, 'trip')?.name ?? 'Trip';
  const tracks = tripSegments(store)
    .filter((seg) => !activeOnly || ACTIVE_MODES.has(seg.mode))
    .map((seg) => track(seg, store.get(seg.stageId, 'stage')));
  return { name, xml: toGpx(name, tracks, waypoints(store, null)) };
}

export function stageGpx(store: TripStore, stageId: string): { name: string; xml: string } {
  const stage = store.get(stageId, 'stage');
  const name = stage?.name ?? 'Stage';
  const tracks = stageSegments(store, stageId).map((seg) => track(seg, stage));
  return { name, xml: toGpx(name, tracks, waypoints(store, tracks)) };
}

export function groupGpx(store: TripStore, groupId: string): { name: string; xml: string } {
  const group = store.get(groupId, 'group');
  const name = group?.name ?? 'Group';
  const stage = group ? store.get(group.stageId, 'stage') : undefined;
  const tracks = groupSegments(store, groupId).map((seg) => track(seg, stage));
  return { name, xml: toGpx(name, tracks, waypoints(store, tracks)) };
}

export function segmentGpx(store: TripStore, segmentId: string): { name: string; xml: string } {
  const seg = store.get(segmentId, 'segment');
  if (!seg) return { name: 'Segment', xml: toGpx('Segment', []) };
  const tracks = [track(seg, store.get(seg.stageId, 'stage'))];
  return { name: seg.name, xml: toGpx(seg.name, tracks, waypoints(store, tracks)) };
}
