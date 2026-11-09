import type { ExpressionSpecification, GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { LEG_STATUS_STYLES, MODE_ORDER, MODES, type LineStyle } from '../../config/modes';
import type { LayerManager } from '../../core/layers';
import type { TripStore } from '../../core/store';
import { legCoords } from '../../model/segment';
import type { Segment, Stage } from '../../model/types';

type LineFeature = GeoJSON.Feature<GeoJSON.LineString, LegProps>;

export interface LegProps {
  sid: string;
  leg: number;
  mode: Segment['mode'];
  color: string;
  status?: 'pending' | 'failed';
}

export const SRC = {
  bg: 'routes',
  active: 'routes-active',
  anchors: 'route-anchors',
  ghost: 'route-ghost',
  preview: 'route-preview',
} as const;

const PLANE_ICON = 'route-plane';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function segmentColor(seg: Segment, stage: Stage | undefined): string {
  const mode = MODES[seg.mode];
  if (!mode.stageColor) return mode.style.color;
  return seg.color ?? stage?.color ?? mode.style.color;
}

export function legFeatures(seg: Segment, color: string): LineFeature[] {
  return seg.legs.map((leg, i) => ({
    type: 'Feature',
    properties: { sid: seg.id, leg: i, mode: seg.mode, color, ...(leg.status ? { status: leg.status } : {}) },
    geometry: { type: 'LineString', coordinates: legCoords(leg).map((c) => [c[0], c[1]]) },
  }));
}

function linePaint(style: LineStyle, color: string | ExpressionSpecification, extraWidth = 0): LineLayerSpecification['paint'] {
  return {
    'line-color': color,
    'line-width': style.width + extraWidth,
    'line-opacity': style.opacity ?? 1,
    ...(style.dash ? { 'line-dasharray': style.dash } : {}),
  };
}

const roundCaps = (style: LineStyle) => !style.dash || style.dash[0] === 0;

function planeImage(): ImageData {
  const ratio = 2;
  const size = 24 * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  // Pointing east, so it follows the line direction.
  const path = new Path2D(
    'M21.5 12c0-.8-.7-1.5-1.5-1.5h-5.2L9.6 3H7.4l2.6 7.5H5L3.3 8.4H1.8l1 3.6-1 3.6h1.5L5 13.5h5L7.4 21h2.2l5.2-7.5H20c.8 0 1.5-.7 1.5-1.5z',
  );
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.stroke(path);
  g.fillStyle = MODES.plane.style.color;
  g.fill(path);
  return g.getImageData(0, 0, size, size);
}

/**
 * Draws segments from two GeoJSON sources: one for the selected segment, which is redrawn on
 * every edit, and one for everything else, which only changes when other segments do.
 */
export class RouteRenderer {
  #activeId: string | null = null;
  #dirtyBg = true;
  #dirtyActive = true;
  #frame = 0;
  #cache = new WeakMap<Segment, { color: string; features: LineFeature[] }>();

  readonly modeLayerIds: string[] = [];
  readonly hitLayerIds = [`${SRC.bg}-hit`, `${SRC.active}-hit`];
  readonly anchorLayerId = 'route-anchors';
  readonly ghostLayerId = 'route-ghost';

  constructor(
    private map: MapLibreMap,
    private layers: LayerManager,
    private store: TripStore,
  ) {}

  install(): void {
    if (!this.map.hasImage(PLANE_ICON)) this.map.addImage(PLANE_ICON, planeImage(), { pixelRatio: 2 });
    for (const id of Object.values(SRC)) {
      const attribution = id === SRC.bg ? 'Routing: <a href="https://brouter.de/">BRouter</a>' : undefined;
      this.layers.addSource(id, { type: 'geojson', data: EMPTY, ...(attribution ? { attribution } : {}) });
    }
    this.#addRouteLayers(SRC.bg, false);
    this.#addRouteLayers(SRC.active, true);

    this.layers.addLayer(
      {
        id: 'route-preview',
        type: 'line',
        source: SRC.preview,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#495057', 'line-width': 2, 'line-dasharray': [2, 2] },
      },
      'top',
    );
    this.layers.addLayer(
      {
        id: this.ghostLayerId,
        type: 'circle',
        source: SRC.ghost,
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      },
      'top',
    );
    this.layers.addLayer(
      {
        id: this.anchorLayerId,
        type: 'circle',
        source: SRC.anchors,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 7, ['get', 'end'], 6, 4.5],
          'circle-color': ['case', ['any', ['get', 'end'], ['get', 'selected']], ['get', 'color'], '#ffffff'],
          'circle-stroke-color': ['case', ['any', ['get', 'end'], ['get', 'selected']], '#ffffff', ['get', 'color']],
          'circle-stroke-width': 2,
        },
      },
      'top',
    );
  }

  #addRouteLayers(source: string, active: boolean): void {
    const add = (layer: Omit<LineLayerSpecification, 'source'>) =>
      this.layers.addLayer({ ...layer, source } as LineLayerSpecification, 'route');
    const notStatus: ExpressionSpecification = ['!', ['has', 'status']];

    if (active) {
      add({
        id: `${source}-casing`,
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.85, 'line-blur': 1 },
      });
    }

    for (const mode of MODE_ORDER) {
      const { style } = MODES[mode];
      const filter: ExpressionSpecification = ['all', ['==', ['get', 'mode'], mode], notStatus];
      const id = `${source}-${mode}`;
      add({
        id,
        type: 'line',
        filter,
        layout: { 'line-join': 'round', 'line-cap': roundCaps(style) ? 'round' : 'butt' },
        paint: linePaint(style, ['get', 'color'], active ? 1 : 0),
      });
      this.modeLayerIds.push(id);
      if (style.overlay) {
        add({
          id: `${id}-overlay`,
          type: 'line',
          filter,
          layout: { 'line-join': 'round', 'line-cap': 'butt' },
          paint: linePaint({ ...style.overlay }, style.overlay.color),
        });
      }
    }

    for (const status of ['pending', 'failed'] as const) {
      const style = LEG_STATUS_STYLES[status];
      add({
        id: `${source}-${status}`,
        type: 'line',
        filter: ['==', ['get', 'status'], status],
        layout: { 'line-cap': 'butt' },
        paint: linePaint(style, style.color),
      });
      this.modeLayerIds.push(`${source}-${status}`);
    }

    this.layers.addLayer(
      {
        id: `${source}-plane-icon`,
        type: 'symbol',
        source,
        filter: ['==', ['get', 'mode'], 'plane'],
        layout: {
          'symbol-placement': 'line-center',
          'icon-image': PLANE_ICON,
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 0.9,
        },
      },
      'route',
    );

    add({
      id: `${source}-hit`,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-width': 16, 'line-opacity': 0 },
    });
  }

  get activeId(): string | null {
    return this.#activeId;
  }

  setActive(id: string | null): void {
    if (id === this.#activeId) return;
    this.#activeId = id;
    this.#dirtyBg = this.#dirtyActive = true;
    this.#schedule();
  }

  /** Marks the sources that show any of these entities as out of date. */
  invalidate(ids: string[]): void {
    for (const id of ids) {
      const e = this.store.getRaw(id);
      if (!e) continue;
      if (e.type === 'stage') this.#dirtyBg = this.#dirtyActive = true;
      else if (e.type === 'segment') {
        if (id === this.#activeId) this.#dirtyActive = true;
        else this.#dirtyBg = true;
      }
    }
    this.#schedule();
  }

  invalidateAll(): void {
    this.#dirtyBg = this.#dirtyActive = true;
    this.#schedule();
  }

  setData(source: (typeof SRC)[keyof typeof SRC], features: GeoJSON.Feature[]): void {
    (this.map.getSource(source) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  #schedule(): void {
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#flush());
  }

  #featuresOf(seg: Segment): LineFeature[] {
    const color = segmentColor(seg, this.store.get(seg.stageId, 'stage'));
    const hit = this.#cache.get(seg);
    if (hit && hit.color === color) return hit.features;
    const features = legFeatures(seg, color);
    this.#cache.set(seg, { color, features });
    return features;
  }

  #flush(): void {
    this.#frame = 0;
    if (this.#dirtyBg) {
      const features = this.store.list('segment', (s) => s.id !== this.#activeId).flatMap((s) => this.#featuresOf(s));
      this.setData(SRC.bg, features);
      this.#dirtyBg = false;
    }
    if (this.#dirtyActive) {
      const seg = this.#activeId ? this.store.get(this.#activeId, 'segment') : undefined;
      this.setData(SRC.active, seg ? this.#featuresOf(seg) : []);
      this.#dirtyActive = false;
    }
  }
}
