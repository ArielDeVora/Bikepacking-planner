export type LngLat = [lng: number, lat: number];

export type EntityType = 'trip' | 'stage' | 'segment' | 'poi' | 'zone' | 'borderCrossing' | 'comment';

export interface BaseEntity {
  id: string;
  type: EntityType;
  tripId: string;
  updatedAt: number;
  updatedBy: string;
  deleted: boolean;
}

export interface Trip extends BaseEntity {
  type: 'trip';
  name: string;
  ownerId: string;
  startDate?: string;
}

export interface Stage extends BaseEntity {
  type: 'stage';
  order: string;
  name: string;
  notes: string;
  color?: string;
  plannedDate?: string;
}

export type TravelMode = 'bike' | 'walk' | 'train' | 'bus' | 'boat' | 'plane' | 'car';
export type GeometryType = 'routed' | 'manual' | 'imported' | 'greatCircle';

export interface Anchor {
  id: string;
  lngLat: LngLat;
  /** How the leg from this anchor to the next one is drawn: routed (true) or straight (false). */
  snap: boolean;
}

/** Compact encoding of a polyline with elevation. */
export type EncodedLine = string;

export interface SegmentStats {
  lengthM: number;
  ascentM: number;
  descentM: number;
}

export interface Segment extends BaseEntity {
  type: 'segment';
  stageId: string;
  order: string;
  name: string;
  notes: string;
  mode: TravelMode;
  geomType: GeometryType;
  anchors: Anchor[];
  /** One entry per pair of consecutive anchors. */
  legs: EncodedLine[];
  stats: SegmentStats;
  profile?: string;
  color?: string;
  plannedDate?: string;
}

export type PoiCategory =
  | 'sight'
  | 'camp'
  | 'water'
  | 'food'
  | 'bikeShop'
  | 'accommodation'
  | 'admin'
  | 'border'
  | 'other';

export type PoiStatus = 'idea' | 'mustSee' | 'booked' | 'skip';

export interface OsmRef {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  fetchedAt: number;
}

export interface Poi extends BaseEntity {
  type: 'poi';
  lngLat: LngLat;
  category: PoiCategory;
  name: string;
  notes: string;
  links: string[];
  status: PoiStatus;
  createdBy: string;
  osm?: OsmRef;
}

export interface Zone extends BaseEntity {
  type: 'zone';
  kind: 'avoid' | 'risk';
  polygon: LngLat[][];
  name: string;
  reason: string;
  severity: 'nogo' | 'caution';
  addedAt: number;
  source?: string;
  sourceUrl?: string;
  dataDate?: string;
}

export type CrossingStatus = 'open' | 'closedToForeigners' | 'unknown';

export interface BorderCrossing extends BaseEntity {
  type: 'borderCrossing';
  lngLat: LngLat;
  name: string;
  status: CrossingStatus;
  notes: string;
  osmNodeId?: number;
  link?: string;
  lastVerified?: string;
}

export interface Comment extends BaseEntity {
  type: 'comment';
  targetId: string;
  body: string;
  authorId: string;
  createdAt: number;
}

export type Entity = Trip | Stage | Segment | Poi | Zone | BorderCrossing | Comment;
export type EntityOf<T extends EntityType> = Extract<Entity, { type: T }>;

/** An entity before it has been stamped by the command system. */
export type Draft<E extends Entity> = Omit<E, 'updatedAt' | 'updatedBy' | 'deleted'>;
