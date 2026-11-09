import { edits, type Command } from '../../core/commands';
import { newId } from '../../model/ids';
import type { LngLat, OsmRef, Poi, PoiCategory } from '../../model/types';

export interface NewPoi {
  tripId: string;
  userId: string;
  lngLat: LngLat;
  name: string;
  category: PoiCategory;
  notes?: string;
  links?: string[];
  osm?: OsmRef;
}

export function createPoiCommand(p: NewPoi, label: string): { command: Command; id: string } {
  const id = newId();
  return {
    id,
    command: {
      label,
      changes: [
        edits.create<Poi>({
          id,
          type: 'poi',
          tripId: p.tripId,
          lngLat: p.lngLat,
          category: p.category,
          name: p.name,
          notes: p.notes ?? '',
          links: p.links ?? [],
          status: 'idea',
          createdBy: p.userId,
          ...(p.osm ? { osm: p.osm } : {}),
        }),
      ],
    },
  };
}
