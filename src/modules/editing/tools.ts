import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import type { ModuleContext } from '../../core/module';
import { closestOnPolyline } from '../../lib/geo/geo';
import { eraseCommand, splitCommand } from '../../lib/segment-edits';
import { distanceAlong, sliceLine } from '../../model/edit-ops';
import { legCoords } from '../../model/segment';
import type { LngLat, Segment } from '../../model/types';

export const SPLIT_TOOL = 'editing.split';
export const ERASE_TOOL = 'editing.erase';

export const PREVIEW = 'edit-preview';
const NEAR_PX = 14;

/** Split and erase tools: they act on the selected segment, at the point of the line nearest the cursor. */
export class EditTools {
  #eraseFrom: number | null = null;

  constructor(private ctx: ModuleContext) {}

  get #segment(): Segment | undefined {
    const ids = this.ctx.selection.current;
    return ids.length === 1 ? this.ctx.store.get(ids[0]!, 'segment') : undefined;
  }

  get #tool(): string | null {
    const tool = get(this.ctx.ui.tool);
    return tool === SPLIT_TOOL || tool === ERASE_TOOL ? tool : null;
  }

  attach(): () => void {
    const { map } = this.ctx;
    const move = (e: MapMouseEvent) => this.#onMove(e);
    const click = (e: MapMouseEvent) => this.#onClick(e);
    map.on('mousemove', move);
    map.on('click', click);
    const offTool = this.ctx.ui.tool.subscribe(() => {
      this.#eraseFrom = null;
      this.#show([]);
    });
    const offSelection = this.ctx.bus.on('selection:changed', () => {
      this.#eraseFrom = null;
      this.#show([]);
    });
    return () => {
      map.off('mousemove', move);
      map.off('click', click);
      offTool();
      offSelection();
    };
  }

  /** Point on the segment's line nearest to the cursor, if close enough. */
  #nearest(seg: Segment, e: MapMouseEvent): { lngLat: LngLat; along: number } | null {
    const { map } = this.ctx;
    let best: { lngLat: LngLat; dist: number } | null = null;
    for (const leg of seg.legs) {
      const pts = legCoords(leg).map((c) => {
        const p = map.project([c[0], c[1]]);
        return [p.x, p.y] as [number, number];
      });
      const hit = closestOnPolyline(pts, [e.point.x, e.point.y]);
      if (hit && (!best || hit.dist < best.dist)) {
        const ll = map.unproject(hit.point);
        best = { lngLat: [ll.lng, ll.lat], dist: hit.dist };
      }
    }
    if (!best || best.dist > NEAR_PX) return null;
    return { lngLat: best.lngLat, along: distanceAlong(seg, best.lngLat) };
  }

  #onMove(e: MapMouseEvent): void {
    const tool = this.#tool;
    const seg = this.#segment;
    if (!tool || !seg) return;
    const near = this.#nearest(seg, e);
    const features: GeoJSON.Feature[] = [];
    if (tool === ERASE_TOOL && this.#eraseFrom !== null) {
      const to = near?.along ?? this.#eraseFrom;
      features.push(line(sliceLine(seg, this.#eraseFrom, to).map((c) => [c[0], c[1]])));
    }
    if (near) features.push(point(near.lngLat, tool));
    this.#show(features);
  }

  #onClick(e: MapMouseEvent): void {
    const tool = this.#tool;
    const seg = this.#segment;
    if (!tool || !seg) return;
    const near = this.#nearest(seg, e);
    if (!near) return;
    const { store, commands, t, ui, selection } = this.ctx;
    const names = { label: '', name: (n: string) => n };

    if (tool === SPLIT_TOOL) {
      const res = splitCommand(store, seg, near.along, { ...names, label: t('cmd.split') });
      if (!res) return;
      commands.run(res.command);
      ui.setTool(null);
      selection.set([seg.id]);
      return;
    }
    if (this.#eraseFrom === null) {
      this.#eraseFrom = near.along;
      return;
    }
    commands.run(eraseCommand(store, seg, this.#eraseFrom, near.along, { ...names, label: t('cmd.erase') }));
    this.#eraseFrom = null;
    ui.setTool(null);
  }

  #show(features: GeoJSON.Feature[]): void {
    (this.ctx.map.getSource(PREVIEW) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }
}

const line = (coords: number[][]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: coords },
});

const point = (lngLat: LngLat, tool: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { tool },
  geometry: { type: 'Point', coordinates: lngLat },
});
