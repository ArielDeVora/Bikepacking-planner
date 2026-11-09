import type { MapMouseEvent, PointLike } from 'maplibre-gl';
import { derived, get, type Readable } from 'svelte/store';
import { edits } from '../../core/commands';
import type { ModuleContext } from '../../core/module';
import { closestOnPolyline } from '../../lib/geo/geo';
import { insertAnchor, legCoords, moveAnchor, removeAnchor } from '../../model/segment';
import type { LngLat, Segment, TravelMode } from '../../model/types';
import { createSegment } from './actions';
import { segmentColor, SRC, type RouteRenderer } from './render';

export const DRAW_TOOL = 'routes.draw';

const HIT_PX = 5;
const SNAP_PX = 10;
const CLICK_PX = 3;

interface Drag {
  segId: string;
  index: number;
  kind: 'move' | 'insert';
  start: { x: number; y: number };
  lngLat: LngLat;
  moved: boolean;
}

type Ghost = { index: number; lngLat: LngLat } | null;

const box = (p: { x: number; y: number }, r: number): [PointLike, PointLike] => [
  [p.x - r, p.y - r],
  [p.x + r, p.y + r],
];

const toLngLat = (e: MapMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];

/** Map interactions for drawing segments and editing their anchors. */
export class RouteEditor {
  readonly drawing: Readable<boolean>;
  #start: LngLat | null = null;
  #anchor: number | null = null;
  #drag: Drag | null = null;
  #ghost: Ghost = null;
  #cursor: LngLat | null = null;
  #frame = 0;

  constructor(
    private ctx: ModuleContext,
    private renderer: RouteRenderer,
    private defaultMode: () => TravelMode,
  ) {
    this.drawing = derived(ctx.ui.tool, (tool) => tool === DRAW_TOOL);
  }

  /** Another module's tool is active: leave the map to it, apart from selecting segments. */
  get #otherTool(): boolean {
    const tool = get(this.ctx.ui.tool);
    return !!tool && tool !== DRAW_TOOL;
  }

  /** The selected segment, if its points can be edited (imported tracks can't be, yet). */
  get #active(): Segment | undefined {
    const id = this.renderer.activeId;
    const seg = id ? this.ctx.store.get(id, 'segment') : undefined;
    if (!seg || seg.geomType === 'imported') return undefined;
    // Hidden from the map: nothing to edit there.
    return this.ctx.visibility.isHidden(seg.id) || this.ctx.visibility.isHidden(seg.stageId) ? undefined : seg;
  }

  attach(): () => void {
    const { map } = this.ctx;
    const handlers = {
      click: (e: MapMouseEvent) => this.#onClick(e),
      mousedown: (e: MapMouseEvent) => this.#onMouseDown(e),
      mousemove: (e: MapMouseEvent) => this.#onMouseMove(e),
      contextmenu: (e: MapMouseEvent) => this.#onContextMenu(e),
      mouseout: () => this.#setHover(null, null),
    };
    for (const [type, fn] of Object.entries(handlers)) map.on(type as 'click', fn);
    const offTool = this.ctx.ui.tool.subscribe((tool) => {
      if (tool !== DRAW_TOOL && (this.#start || this.#cursor)) {
        this.#start = null;
        this.#cursor = null;
      }
      this.#ghost = null;
      this.#updateCursor();
      this.refresh();
    });
    return () => {
      for (const [type, fn] of Object.entries(handlers)) map.off(type as 'click', fn);
      offTool();
    };
  }

  // Drawing

  isDrawing(): boolean {
    return get(this.drawing);
  }

  toggleDrawing(): void {
    const starting = !get(this.drawing);
    this.ctx.ui.toggleTool(DRAW_TOOL);
    if (starting) this.ctx.ui.notify(this.ctx.t('routes.drawHint'), 'info', 4000);
  }

  stopDrawing(): void {
    if (get(this.drawing)) this.ctx.ui.setTool(null);
  }

  #addPoint(lngLat: LngLat): void {
    const { store, commands, t } = this.ctx;
    const seg = this.#active;
    if (seg) {
      commands.run({
        label: t('cmd.addPoint'),
        changes: [edits.update<Segment>(store, seg.id, insertAnchor(seg, seg.anchors.length, lngLat))],
      });
      return;
    }
    if (!this.#start) {
      this.#start = lngLat;
      this.refresh();
      return;
    }
    const selected = this.ctx.selection.current[0];
    const selectedEntity = selected ? store.get(selected) : undefined;
    const stageId =
      selectedEntity?.type === 'stage' ? selectedEntity.id : selectedEntity?.type === 'segment' ? selectedEntity.stageId : undefined;
    const { command, segmentId } = createSegment(store, {
      tripId: this.ctx.tripId,
      stageId,
      mode: this.defaultMode(),
      points: [this.#start, lngLat],
      label: t('cmd.drawSegment'),
      segmentName: (n) => t('routes.segmentName', { n }),
      stageName: t('tree.stageName', { n: 1 }),
    });
    this.#start = null;
    commands.run(command);
    this.ctx.selection.set([segmentId]);
  }

  // Anchors

  onSelectionChanged(): void {
    this.#anchor = null;
    this.#ghost = null;
    this.refresh();
  }

  /** Deletes the selected anchor; returns false if there is none. */
  deleteSelectedAnchor(): boolean {
    const seg = this.#active;
    if (!seg || this.#anchor === null) return false;
    this.#removeAnchor(seg, this.#anchor);
    return true;
  }

  clearAnchor(): boolean {
    if (this.#anchor === null) return false;
    this.#anchor = null;
    this.refresh();
    return true;
  }

  #removeAnchor(seg: Segment, index: number): void {
    const { store, commands, t } = this.ctx;
    this.#anchor = null;
    if (seg.anchors.length <= 2) {
      commands.run({ label: t('cmd.deleteSegment'), changes: [edits.remove(store, seg.id)] });
      return;
    }
    commands.run({ label: t('cmd.deletePoint'), changes: [edits.update<Segment>(store, seg.id, removeAnchor(seg, index))] });
  }

  /** Snaps to the start or end of any segment within a few pixels. */
  #snap(point: { x: number; y: number }, lngLat: LngLat, skip?: { segId: string; index: number }): LngLat {
    const { map, store } = this.ctx;
    let best: LngLat = lngLat;
    let bestDist = SNAP_PX;
    for (const seg of store.list('segment')) {
      const last = seg.anchors.length - 1;
      for (const i of last > 0 ? [0, last] : [0]) {
        if (skip && skip.segId === seg.id && skip.index === i) continue;
        const a = seg.anchors[i];
        if (!a) continue;
        const p = map.project(a.lngLat);
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d < bestDist) {
          bestDist = d;
          best = a.lngLat;
        }
      }
    }
    return best;
  }

  #anchorAt(point: { x: number; y: number }): number | null {
    if (!this.renderer.activeId) return null;
    const hit = this.ctx.map.queryRenderedFeatures(box(point, HIT_PX), { layers: [this.renderer.anchorLayerId] })[0];
    return hit?.properties.kind === 'anchor' ? (hit.properties.i as number) : null;
  }

  // Map events

  /** A place, crossing or other marker under the cursor: its module handles the click. */
  #onMarker(point: { x: number; y: number }): boolean {
    const { map, ui } = this.ctx;
    const layers = ui.pointLayers.filter((id) => map.getLayer(id));
    return layers.length > 0 && map.queryRenderedFeatures(box(point, HIT_PX), { layers }).length > 0;
  }

  #onClick(e: MapMouseEvent): void {
    if (get(this.drawing)) {
      this.#addPoint(this.#snap(e.point, toLngLat(e)));
      return;
    }
    if (this.#anchorAt(e.point) === null && this.#onMarker(e.point)) return;
    if (this.#otherTool) {
      const hit = this.ctx.map.queryRenderedFeatures(box(e.point, HIT_PX), { layers: this.renderer.hitLayerIds })[0];
      if (hit) this.ctx.selection.set([hit.properties.sid as string]);
      return;
    }
    const anchor = this.#anchorAt(e.point);
    if (anchor !== null) {
      this.ctx.ui.claim(e.originalEvent);
      this.#anchor = anchor;
      this.refresh();
      return;
    }
    const hit = this.ctx.map.queryRenderedFeatures(box(e.point, HIT_PX), { layers: this.renderer.hitLayerIds })[0];
    if (hit) {
      this.ctx.ui.claim(e.originalEvent);
      const id = hit.properties.sid as string;
      const current = this.ctx.selection.current;
      // Cmd/Ctrl+click adds the segment to the selection, or removes it.
      if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
        this.ctx.selection.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
      } else this.ctx.selection.set([id]);
    } else {
      this.ctx.selection.clear();
      this.ctx.ui.closePlace();
    }
  }

  #onMouseDown(e: MapMouseEvent): void {
    if (get(this.drawing) || this.#otherTool || e.originalEvent.button !== 0) return;
    const seg = this.#active;
    if (!seg) return;
    const anchor = this.#anchorAt(e.point);
    if (anchor === null && this.#onMarker(e.point)) return;
    let drag: Drag | null = null;
    if (anchor !== null) {
      drag = { segId: seg.id, index: anchor, kind: 'move', start: e.point, lngLat: seg.anchors[anchor]!.lngLat, moved: false };
    } else if (this.#ghost) {
      const g = this.ctx.map.project(this.#ghost.lngLat);
      if (Math.hypot(g.x - e.point.x, g.y - e.point.y) <= HIT_PX * 2) drag = { segId: seg.id, index: this.#ghost.index, kind: 'insert', start: e.point, lngLat: this.#ghost.lngLat, moved: false };
    }
    if (!drag) return;
    e.preventDefault();
    this.#drag = drag;
    this.#ghost = null;
    this.ctx.map.getCanvas().style.cursor = 'grabbing';
    document.addEventListener('mouseup', this.#endDrag, { once: true });
  }

  #onMouseMove(e: MapMouseEvent): void {
    const drag = this.#drag;
    if (drag) {
      if (Math.hypot(e.point.x - drag.start.x, e.point.y - drag.start.y) > CLICK_PX) drag.moved = true;
      if (drag.moved) {
        drag.lngLat = this.#snap(e.point, toLngLat(e), drag.kind === 'move' ? drag : undefined);
        this.refresh();
      }
      return;
    }
    if (get(this.drawing)) {
      this.#cursor = toLngLat(e);
      this.refresh();
      return;
    }
    if (this.#otherTool) return;
    this.#hover(e);
  }

  #endDrag = (): void => {
    const drag = this.#drag;
    this.#drag = null;
    this.#updateCursor();
    if (!drag?.moved) {
      this.refresh();
      return;
    }
    const { store, commands, t } = this.ctx;
    const seg = store.get(drag.segId, 'segment');
    if (seg) {
      const geometry =
        drag.kind === 'move' ? moveAnchor(seg, drag.index, drag.lngLat) : insertAnchor(seg, drag.index, drag.lngLat);
      commands.run({
        label: t(drag.kind === 'move' ? 'cmd.movePoint' : 'cmd.insertPoint'),
        changes: [edits.update<Segment>(store, seg.id, geometry)],
      });
      this.#anchor = drag.index;
    }
    this.refresh();
  };

  #onContextMenu(e: MapMouseEvent): void {
    const seg = this.#active;
    const anchor = this.#anchorAt(e.point);
    if (!seg || anchor === null || this.#otherTool) return;
    e.preventDefault();
    e.originalEvent.preventDefault();
    this.#removeAnchor(seg, anchor);
  }

  #hover(e: MapMouseEvent): void {
    const { map } = this.ctx;
    const seg = this.#active;
    if (seg && this.#anchorAt(e.point) !== null) return this.#setHover('grab', null);

    const hits = map.queryRenderedFeatures(box(e.point, HIT_PX), { layers: this.renderer.hitLayerIds });
    const own = seg && hits.find((h) => h.properties.sid === seg.id);
    if (seg && own) {
      const legIndex = own.properties.leg as number;
      const leg = seg.legs[legIndex];
      if (leg) {
        const pts = legCoords(leg).map((c) => {
          const p = map.project([c[0], c[1]]);
          return [p.x, p.y] as [number, number];
        });
        const best = closestOnPolyline(pts, [e.point.x, e.point.y]);
        if (best) {
          const ll = map.unproject(best.point);
          return this.#setHover('grab', { index: legIndex + 1, lngLat: [ll.lng, ll.lat] });
        }
      }
    }
    this.#setHover(hits.length ? 'pointer' : null, null);
  }

  #setHover(cursor: string | null, ghost: Ghost): void {
    if (this.#drag) return;
    if (!get(this.ctx.ui.tool)) this.ctx.map.getCanvas().style.cursor = cursor ?? '';
    const changed = (ghost === null) !== (this.#ghost === null) || ghost !== null;
    this.#ghost = ghost;
    if (changed) this.refresh();
  }

  #updateCursor(): void {
    this.ctx.map.getCanvas().style.cursor = get(this.ctx.ui.tool) ? 'crosshair' : '';
  }

  // Overlay (anchors, ghost point, preview lines)

  refresh(): void {
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#render());
  }

  #render(): void {
    this.#frame = 0;
    const seg = this.#active;
    const color = seg ? segmentColor(seg, this.ctx.store.get(seg.stageId, 'stage')) : '#495057';
    const point = (lngLat: LngLat, props: Record<string, unknown>): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { color, ...props },
      geometry: { type: 'Point', coordinates: lngLat },
    });
    const line = (coords: LngLat[]): GeoJSON.Feature => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    });

    const anchors: GeoJSON.Feature[] = [];
    const preview: GeoJSON.Feature[] = [];
    const drag = this.#drag?.moved && this.#drag.segId === seg?.id ? this.#drag : null;

    if (seg) {
      const list = seg.anchors.map((a) => a.lngLat);
      if (drag?.kind === 'move') list[drag.index] = drag.lngLat;
      if (drag?.kind === 'insert') list.splice(drag.index, 0, drag.lngLat);
      const last = list.length - 1;
      list.forEach((lngLat, i) => {
        anchors.push(point(lngLat, { kind: 'anchor', i, end: i === 0 || i === last, selected: i === this.#anchor && !drag }));
      });
      if (drag) {
        const coords = [list[drag.index - 1], drag.lngLat, list[drag.index + 1]].filter((c): c is LngLat => !!c);
        preview.push(line(coords));
      }
    }

    if (get(this.drawing)) {
      const from = seg ? seg.anchors.at(-1)?.lngLat : this.#start;
      if (this.#start && !seg) anchors.push(point(this.#start, { kind: 'start', end: true }));
      if (from && this.#cursor) preview.push(line([from, this.#cursor]));
    }

    this.renderer.setData(SRC.anchors, anchors);
    this.renderer.setData(SRC.preview, preview);
    this.renderer.setData(SRC.ghost, this.#ghost && seg && !drag ? [point(this.#ghost.lngLat, {})] : []);
  }
}
