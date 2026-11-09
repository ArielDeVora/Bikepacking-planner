import type { TripStore } from '../../core/store';
import { distanceToLine } from '../../lib/geo/geo';
import { compareOrder } from '../../model/order';
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

const sortedSegments = (store: TripStore, stageId: string) =>
  store.list('segment', (s) => s.stageId === stageId).sort(compareOrder);

export function tripGpx(store: TripStore, tripId: string, activeOnly: boolean): { name: string; xml: string } {
  const name = store.get(tripId, 'trip')?.name ?? 'Trip';
  const tracks = store
    .list('stage')
    .sort(compareOrder)
    .flatMap((st) => sortedSegments(store, st.id).map((seg) => ({ seg, st })))
    .filter(({ seg }) => !activeOnly || ACTIVE_MODES.has(seg.mode))
    .map(({ seg, st }) => track(seg, st));
  return { name, xml: toGpx(name, tracks, waypoints(store, null)) };
}

export function stageGpx(store: TripStore, stageId: string): { name: string; xml: string } {
  const stage = store.get(stageId, 'stage');
  const name = stage?.name ?? 'Stage';
  const tracks = sortedSegments(store, stageId).map((seg) => track(seg, stage));
  return { name, xml: toGpx(name, tracks, waypoints(store, tracks)) };
}

export function segmentGpx(store: TripStore, segmentId: string): { name: string; xml: string } {
  const seg = store.get(segmentId, 'segment');
  if (!seg) return { name: 'Segment', xml: toGpx('Segment', []) };
  const tracks = [track(seg, store.get(seg.stageId, 'stage'))];
  return { name: seg.name, xml: toGpx(seg.name, tracks, waypoints(store, tracks)) };
}
