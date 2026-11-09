import type { GeometryType, LineDash, TravelMode } from '../model/types';

/**
 * Travel modes and how their lines are drawn. Widths are in pixels; dash arrays are in
 * multiples of the line width (MapLibre's `line-dasharray`).
 */
export interface LineStyle {
  color: string;
  width: number;
  dash?: number[];
  opacity?: number;
  /** Drawn on top of the main line, e.g. the white ties of a railway. */
  overlay?: { color: string; width: number; dash?: number[] };
}

export interface ModeConfig {
  id: TravelMode;
  /** Geometry type of new segments in this mode. */
  geomType: GeometryType;
  /** Whether the "snap to roads" toggle is offered (the router must have a profile for it). */
  snappable: boolean;
  /** Take the stage colour (or the segment's own colour) instead of `style.color`. */
  stageColor: boolean;
  /** Fill in elevation from terrain data where the line has none (straight or imported legs). */
  terrain: boolean;
  style: LineStyle;
  /** Map icon at the middle of each line. */
  icon?: 'plane';
}

export const MODES: Record<TravelMode, ModeConfig> = {
  bike: {
    id: 'bike',
    geomType: 'routed',
    snappable: true,
    stageColor: true,
    terrain: true,
    style: { color: '#e8590c', width: 4 },
  },
  walk: {
    id: 'walk',
    geomType: 'routed',
    snappable: true,
    stageColor: true,
    terrain: true,
    style: { color: '#e8590c', width: 3, dash: [0, 2] },
  },
  train: {
    id: 'train',
    geomType: 'manual',
    snappable: true,
    stageColor: false,
    terrain: false,
    style: { color: '#343a40', width: 4.5, overlay: { color: '#ffffff', width: 2, dash: [3, 3] } },
  },
  bus: {
    id: 'bus',
    geomType: 'manual',
    snappable: true,
    stageColor: false,
    terrain: false,
    style: { color: '#9c36b5', width: 3.5, dash: [3, 1.5] },
  },
  car: {
    id: 'car',
    geomType: 'routed',
    snappable: true,
    stageColor: false,
    terrain: false,
    style: { color: '#495057', width: 3.5, dash: [1, 1] },
  },
  boat: {
    id: 'boat',
    geomType: 'manual',
    snappable: false,
    stageColor: false,
    terrain: false,
    style: { color: '#1971c2', width: 3, dash: [2, 2] },
  },
  plane: {
    id: 'plane',
    geomType: 'greatCircle',
    snappable: false,
    stageColor: false,
    terrain: false,
    style: { color: '#495057', width: 2, dash: [4, 3], opacity: 0.9 },
    icon: 'plane',
  },
};

export const MODE_ORDER: TravelMode[] = ['bike', 'walk', 'train', 'bus', 'car', 'boat', 'plane'];

/** Patterns a segment can use instead of its travel mode's (in multiples of the line width). */
export const LINE_DASHES: Record<LineDash, number[] | null> = {
  solid: null,
  dashed: [3, 2],
  dotted: [0, 2],
  long: [6, 3],
};
export const LINE_DASH_ORDER: LineDash[] = ['solid', 'dashed', 'dotted', 'long'];

export const LINE_WIDTH_RANGE = { min: 1, max: 10 };

/** Colours given to new stages, in turn. */
export const STAGE_COLORS = ['#e8590c', '#2f9e44', '#c2255c', '#1098ad', '#f59f00', '#6741d9', '#a61e4d', '#5c940d'];

/** Line style of legs that are waiting for the router, or that it couldn't route. */
export const LEG_STATUS_STYLES = {
  pending: { color: '#868e96', width: 2.5, dash: [2, 2] },
  failed: { color: '#e03131', width: 2.5, dash: [2, 1.5] },
} satisfies Record<string, LineStyle>;
