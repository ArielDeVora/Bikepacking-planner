import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import type { ModuleContext } from '../../core/module';
import { closestOnPolyline } from '../../lib/geo/geo';
import { eraseCommand, splitCommand } from '../../lib/segment-edits';
import { distanceAlong, replaceRange, sliceLine } from '../../model/edit-ops';
import { legCoords } from '../../model/segment';
import type { LngLat, Segment } from '../../model/types';
import type { Coord } from '../../lib/geo/polyline';
import { edits } from '../../core/commands';

export const SPLIT_TOOL = 'editing.split';
export const ERASE_TOOL = 'editing.erase';
export const FOLLOW_TOOL = 'editing.follow';

export const PREVIEW = 'edit-preview';
const NEAR_PX = 14;

/**
 * Split, erase and follow tools: they act on the selected segment, at the point of the line
 * nearest the cursor. Follow replaces a stretch of it with the same stretch of another segment.
 */
export class EditTools {
  #eraseFrom: number | null = null;
  /** Follow: the stretch picked on the selected segment (from, then to). */
  #follow: { from: number; to: number | null } | null = null;

  constructor(private ctx: ModuleContext) {}

  get #segment(): Segment | undefined {
    const ids = this.ctx.selection.current;
    return ids.length === 1 ? this.ctx.store.get(ids[0]!, 'segment') : undefined;
  }

  get #tool(): string | null {
    const tool = get(this.ctx.ui.tool);
    return tool === SPLIT_TOOL || tool === ERASE_TOOL || tool === FOLLOW_TOOL ? tool : null;
  }

  attach(): () => void {
    const { map } = this.ctx;
    const move = (e: MapMouseEvent) => this.#onMove(e);
    const click = (e: MapMouseEvent) => this.#onClick(e);
    map.on('mousemove', move);
    map.on('click', click);
    const offTool = this.ctx.ui.tool.subscribe(() => {
      this.#eraseFrom = null;
      this.#follow = null;
      this.#show([]);
    });
    const offSelection = this.ctx.bus.on('selection:changed', () => {
      this.#eraseFrom = null;
      this.#follow = null;
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

  /** Another segment under the cursor, and the stretch of it that would replace the picked one. */
  #followTarget(seg: Segment, e: MapMouseEvent, from: number, to: number): { other: Segment; path: Coord[] } | null {
    const { map, store } = this.ctx;
    const layers = (map.getStyle().layers ?? []).filter((l) => l.id.endsWith('-hit') && l.id.startsWith('route')).map((l) => l.id);
    const r = NEAR_PX;
    const box: [[number, number], [number, number]] = [
      [e.point.x - r, e.point.y - r],
      [e.point.x + r, e.point.y + r],
    ];
    const hit = map.queryRenderedFeatures(box, { layers }).find((f) => f.properties.sid !== seg.id);
    const other = hit ? store.get(hit.properties.sid as string, 'segment') : undefined;
    if (!other) return null;
    return { other, path: followPath(seg, other, from, to) };
  }

  #onMove(e: MapMouseEvent): void {
    const tool = this.#tool;
    const seg = this.#segment;
    if (!tool || !seg) return;
    if (tool === FOLLOW_TOOL && this.#follow?.to != null) {
      const { from, to } = this.#follow;
      const features = [line(sliceLine(seg, from, to).map((c) => [c[0], c[1]]), 'old')];
      const target = this.#followTarget(seg, e, from, to);
      if (target && target.path.length > 1) features.push(line(target.path.map((c) => [c[0], c[1]]), 'new'));
      return this.#show(features);
    }
    const near = this.#nearest(seg, e);
    const features: GeoJSON.Feature[] = [];
    if (tool === FOLLOW_TOOL && this.#follow) features.push(line(sliceLine(seg, this.#follow.from, near?.along ?? this.#follow.from).map((c) => [c[0], c[1]]), 'old'));
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
    if (tool === FOLLOW_TOOL && this.#follow?.to != null) return this.#finishFollow(seg, e);
    const near = this.#nearest(seg, e);
    if (!near) return;
    const { store, commands, t, ui, selection } = this.ctx;
    ui.claim(e.originalEvent);
    const names = { label: '', name: (n: string) => n };

    if (tool === SPLIT_TOOL) {
      const res = splitCommand(store, seg, near.along, { ...names, label: t('cmd.split') });
      if (!res) return;
      commands.run(res.command);
      ui.setTool(null);
      selection.set([seg.id]);
      return;
    }
    if (tool === FOLLOW_TOOL) {
      if (!this.#follow) this.#follow = { from: near.along, to: null };
      else if (Math.abs(near.along - this.#follow.from) > 1) {
        this.#follow = { from: Math.min(this.#follow.from, near.along), to: Math.max(this.#follow.from, near.along) };
        ui.notify(t('edit.followPickOther'), 'info', 4000);
      }
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

  #finishFollow(seg: Segment, e: MapMouseEvent): void {
    const { from, to } = this.#follow as { from: number; to: number };
    const target = this.#followTarget(seg, e, from, to);
    if (!target) return;
    const { store, commands, t, ui } = this.ctx;
    ui.claim(e.originalEvent);
    const geometry = replaceRange(seg, from, to, target.path);
    if (!geometry) return;
    commands.run({ label: t('cmd.follow', { name: target.other.name }), changes: [edits.update<Segment>(store, seg.id, geometry)] });
    this.#follow = null;
    ui.setTool(null);
  }

  #show(features: GeoJSON.Feature[]): void {
    (this.ctx.map.getSource(PREVIEW) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }
}

/**
 * The stretch of `other` between the points nearest to where the picked stretch of `seg` starts
 * and ends, in `seg`'s direction.
 */
export function followPath(seg: Segment, other: Segment, from: number, to: number): Coord[] {
  const start = sliceLine(seg, from, from)[0];
  const end = sliceLine(seg, to, to)[0];
  if (!start || !end) return [];
  const a = distanceAlong(other, [start[0], start[1]]);
  const b = distanceAlong(other, [end[0], end[1]]);
  const path = sliceLine(other, a, b);
  return a <= b ? path : [...path].reverse();
}

const line = (coords: number[][], kind?: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: kind ? { kind } : {},
  geometry: { type: 'LineString', coordinates: coords },
});

const point = (lngLat: LngLat, tool: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { tool },
  geometry: { type: 'Point', coordinates: lngLat },
});
