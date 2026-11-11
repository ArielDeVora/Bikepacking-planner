import { LngLatBounds, type Map as MapLibreMap } from 'maplibre-gl';
import type { TripStore } from '../../core/store';

/** Frames the whole trip: its segments and places. */
export function fitToTrip(map: MapLibreMap, store: TripStore): void {
  const bounds = new LngLatBounds();
  for (const s of store.list('segment')) for (const a of s.anchors) bounds.extend(a.lngLat);
  for (const p of store.list('poi')) bounds.extend(p.lngLat);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 12 });
}
