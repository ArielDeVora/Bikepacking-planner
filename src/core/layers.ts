import type {
  AddLayerObject,
  LayerSpecification,
  Map as MapLibreMap,
  SourceSpecification,
} from 'maplibre-gl';
import { get, writable, type Readable } from 'svelte/store';
import type { Settings } from './settings';

/** Drawing order, bottom to top. Each slot is a hidden marker layer that others insert before. */
export const LAYER_SLOTS = ['base', 'overlay', 'route', 'poi', 'top'] as const;
export type LayerSlot = (typeof LAYER_SLOTS)[number];

const slotMarker = (slot: LayerSlot) => `slot:${slot}`;

export interface OverlaySpec {
  id: string;
  label: string;
  layerIds: string[];
  visible?: boolean;
  opacity?: number;
  /** Custom opacity handling, for layer types without an opacity property (e.g. hillshade). */
  applyOpacity?: (map: MapLibreMap, opacity: number) => void;
  order?: number;
}

export interface OverlayState {
  spec: OverlaySpec;
  visible: boolean;
  opacity: number;
}

type PaintProperty = Parameters<MapLibreMap['setPaintProperty']>[1];

const OPACITY_PROPS: Partial<Record<LayerSpecification['type'], PaintProperty[]>> = {
  raster: ['raster-opacity'],
  line: ['line-opacity'],
  fill: ['fill-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
  'fill-extrusion': ['fill-extrusion-opacity'],
  heatmap: ['heatmap-opacity'],
};

export class LayerManager {
  #overlays = writable<OverlayState[]>([]);
  readonly overlays: Readable<OverlayState[]> = { subscribe: this.#overlays.subscribe };

  constructor(
    readonly map: MapLibreMap,
    private settings: Settings,
  ) {}

  /** Appends the slot markers on top of the base style. Call once the style has loaded. */
  installSlots(): void {
    for (const slot of LAYER_SLOTS) {
      if (this.map.getLayer(slotMarker(slot))) continue;
      this.map.addLayer({ id: slotMarker(slot), type: 'background', layout: { visibility: 'none' } });
    }
  }

  addSource(id: string, spec: SourceSpecification): void {
    if (!this.map.getSource(id)) this.map.addSource(id, spec);
  }

  addLayer(layer: AddLayerObject, slot: LayerSlot): void {
    if (this.map.getLayer(layer.id)) return;
    this.map.addLayer(layer, slotMarker(slot));
  }

  removeLayer(id: string): void {
    if (this.map.getLayer(id)) this.map.removeLayer(id);
  }

  registerOverlay(spec: OverlaySpec): () => void {
    const saved = this.settings.get<{ visible?: boolean; opacity?: number }>(`overlay.${spec.id}`, {});
    const state: OverlayState = {
      spec,
      visible: saved.visible ?? spec.visible ?? false,
      opacity: saved.opacity ?? spec.opacity ?? 1,
    };
    this.#overlays.update((list) =>
      [...list.filter((o) => o.spec.id !== spec.id), state].sort(
        (a, b) => (a.spec.order ?? 100) - (b.spec.order ?? 100),
      ),
    );
    this.#applyOverlay(state);
    return () => this.#overlays.update((list) => list.filter((o) => o !== state));
  }

  setOverlay(id: string, patch: Partial<Pick<OverlayState, 'visible' | 'opacity'>>): void {
    const current = get(this.#overlays).find((o) => o.spec.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.#overlays.update((list) => list.map((o) => (o === current ? next : o)));
    this.settings.set(`overlay.${id}`, { visible: next.visible, opacity: next.opacity });
    this.#applyOverlay(next);
  }

  setLayersVisible(layerIds: string[], visible: boolean): void {
    for (const id of layerIds) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  setLayersOpacity(layerIds: string[], opacity: number): void {
    for (const id of layerIds) {
      const layer = this.map.getLayer(id);
      if (!layer) continue;
      for (const prop of OPACITY_PROPS[layer.type as LayerSpecification['type']] ?? []) {
        this.map.setPaintProperty(id, prop, opacity);
      }
    }
  }

  #applyOverlay({ spec, visible, opacity }: OverlayState): void {
    this.setLayersVisible(spec.layerIds, visible);
    if (spec.applyOpacity) spec.applyOpacity(this.map, opacity);
    else this.setLayersOpacity(spec.layerIds, opacity);
  }
}
