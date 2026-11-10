export type LngLat = [lng: number, lat: number];

export type EntityType = 'trip' | 'route' | 'stage' | 'group' | 'segment' | 'poi' | 'zone' | 'borderCrossing' | 'comment';

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
  /** The route it belongs to (none: directly in the trip). */
  routeId?: string;
  /** Order among its route's stages, or among the trip's routes and loose stages. */
  order: string;
  name: string;
  notes: string;
  color?: string;
  plannedDate?: string;
}

/**
 * A route: one way of doing the trip (a plan from one source, a variant), made of stages. The
 * trip's routes and its stages that aren't in a route share one order; a route's stages are
 * ordered among themselves.
 */
export interface Route extends BaseEntity {
  type: 'route';
  order: string;
  name: string;
  notes: string;
  /** Colour for its bike and walk segments, instead of the stages' colours. */
  color?: string;
  /** Where the route comes from (a group, a website…), and a link. */
  source?: string;
  sourceUrl?: string;
}

/**
 * Segments grouped within a stage. A stage's children are its groups and its ungrouped segments,
 * sharing one order; a group's segments are ordered among themselves.
 */
export interface Group extends BaseEntity {
  type: 'group';
  stageId: string;
  order: string;
  name: string;
  notes: string;
  /** Colour for its bike and walk segments, instead of the stage's. */
  color?: string;
  plannedDate?: string;
}

export type TravelMode = 'bike' | 'walk' | 'train' | 'bus' | 'boat' | 'plane' | 'car';

/** Line pattern of a segment that overrides its travel mode's. */
export type LineDash = 'solid' | 'dashed' | 'dotted' | 'long';
export type GeometryType = 'routed' | 'manual' | 'imported' | 'greatCircle';

export interface Anchor {
  id: string;
  lngLat: LngLat;
}

/** Compact encoding of a polyline with optional elevation (see lib/geo/polyline.ts). */
export type EncodedLine = string;

/**
 * Geometry between two consecutive anchors. `pending`: a straight placeholder waiting for the
 * router. `failed`: the router gave up, so the leg is drawn straight.
 */
export interface Leg {
  line: EncodedLine;
  status?: 'pending' | 'failed';
}

export interface SegmentStats {
  lengthM: number;
  ascentM: number;
  descentM: number;
}

export interface Segment extends BaseEntity {
  type: 'segment';
  stageId: string;
  /** The group it belongs to, within its stage (none: directly in the stage). */
  groupId?: string;
  /** Order among its group's segments, or among the stage's children when not in a group. */
  order: string;
  name: string;
  notes: string;
  mode: TravelMode;
  geomType: GeometryType;
  anchors: Anchor[];
  /** One entry per pair of consecutive anchors. */
  legs: Leg[];
  stats: SegmentStats;
  /** Routing profile; the provider's default for the mode when unset. */
  profile?: string;
  /** Overrides the stage's or travel mode's colour. */
  color?: string;
  /** Line width in pixels, overriding the travel mode's. */
  lineWidth?: number;
  /** Line pattern, overriding the travel mode's. */
  dash?: LineDash;
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

export type Entity = Trip | Route | Stage | Group | Segment | Poi | Zone | BorderCrossing | Comment;
export type EntityOf<T extends EntityType> = Extract<Entity, { type: T }>;

/** An entity before it has been stamped by the command system. */
export type Draft<E extends Entity> = Omit<E, 'updatedAt' | 'updatedBy' | 'deleted'>;
