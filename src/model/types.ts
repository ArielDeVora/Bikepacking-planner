export type LngLat = [lng: number, lat: number];

export type EntityType = 'trip' | 'route' | 'stage' | 'group' | 'segment' | 'poi' | 'poiFolder' | 'vote' | 'restPeriod' | 'zone' | 'borderCrossing' | 'comment' | 'gear';

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
  /** Built-in place categories this trip doesn't use, each replaced by one of its own (custom) categories. */
  categoryReplacements?: Record<string, string>;
  /** Display order of the place categories (ids); unlisted ones follow in their default order. */
  categoryOrder?: string[];
  /** How the days are worked out for the stages outside routes (see the planning view). */
  schedule?: Partial<ScheduleSettings>;
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
  /** How its days are worked out (see the planning view). */
  schedule?: Partial<ScheduleSettings>;
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
  /** Days it takes in the plan, whatever its length (by default: from the daily distance; 1 for motorised journeys). */
  planDays?: number;
  /** Daily distance for this segment, instead of the plan's. */
  planKmPerDay?: number;
  /**
   * Planning settings for its stretch in each country (a line of the planning calendar), by
   * country code and how many times the segment entered it before, e.g. "BA#0".
   */
  planParts?: Record<string, PlanPart>;
}

export type PoiCategory =
  | 'sight'
  | 'nature'
  | 'camp'
  | 'water'
  | 'food'
  | 'bikeShop'
  | 'accommodation'
  | 'admin'
  | 'border'
  | 'other';

export type PoiStatus = 'idea' | 'mustSee' | 'goated' | 'skip';

export interface OsmRef {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  fetchedAt: number;
}

export interface Poi extends BaseEntity {
  type: 'poi';
  lngLat: LngLat;
  /** A built-in category (`PoiCategory`) or the id of a custom one (`PoiFolder`). */
  category: string;
  name: string;
  notes: string;
  links: string[];
  status: PoiStatus;
  createdBy: string;
  osm?: OsmRef;
  /** Older data: the folder it was put in, turned into its category when loaded. */
  folderId?: string;
  /** Position in its category's folder, once someone dragged it there (else sorted by name). */
  order?: string;
}

/** Planning settings for one stretch of a segment; empty fields fall back to the segment's, then the plan's. */
export interface PlanPart {
  /** A date it must start on. */
  fixed?: string;
  kmPerDay?: number;
  /** Days it takes, whatever its length. */
  days?: number;
}

/** How the days of a route are worked out (the planning view). */
export interface ScheduleSettings {
  /** First day, YYYY-MM-DD. */
  startDate: string;
  /** Distance ridden on a day by bike, and on foot. */
  kmPerDay: number;
  walkKmPerDay: number;
  /** A rest day after this many days of riding (0: none). */
  restEvery: number;
  /** Kilometres added to the day's effort for each 100 m of climbing. */
  climbKm: number;
}

/** Days off on the calendar (a visa wait, a holiday): no riding from `from` to `to`, inclusive. */
export interface RestPeriod extends BaseEntity {
  type: 'restPeriod';
  /** The route it applies to; none for the stages outside routes. */
  routeId?: string;
  from: string;
  to: string;
  name: string;
}

/** What someone thinks of a place: not for me, yes, GOATED; 0 once taken back. */
export type VoteValue = -1 | 0 | 1 | 2;

/** One person's vote on a place. Its id is derived from both, so each person has one vote per place. */
export interface Vote extends BaseEntity {
  type: 'vote';
  poiId: string;
  userId: string;
  value: VoteValue;
}

/** A custom category of places, with its own folder in the Places list. */
export interface PoiFolder extends BaseEntity {
  type: 'poiFolder';
  name: string;
  order: string;
  color?: string;
  /** Key in `POI_ICONS`, chosen by whoever made it. */
  icon?: string;
  createdBy?: string;
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
  /** Ids of the members mentioned with "@Name". */
  mentions?: string[];
}

export type GearStatus = 'needed' | 'bought' | 'packed';

/** An item on the gear checklist: the group's shared gear, or one person's own. */
export interface Gear extends BaseEntity {
  type: 'gear';
  name: string;
  /** Section of the list (Sleeping, Cooking…). */
  category: string;
  /** The member it's for; none for shared gear. */
  forId?: string;
  status: GearStatus;
  /** Who bought it (or already has it). */
  boughtBy?: string;
  qty: number;
  /** Grams, for one. */
  weight?: number;
  /** Price for one. */
  price?: number;
  notes?: string;
  order: number;
}

export type Entity = Trip | Route | Stage | Group | Segment | Poi | PoiFolder | Vote | RestPeriod | Zone | BorderCrossing | Comment | Gear;
export type EntityOf<T extends EntityType> = Extract<Entity, { type: T }>;

/** An entity before it has been stamped by the command system. */
export type Draft<E extends Entity> = Omit<E, 'updatedAt' | 'updatedBy' | 'deleted'>;
