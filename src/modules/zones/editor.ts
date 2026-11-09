import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import { edits } from '../../core/commands';
import type { ModuleContext } from '../../core/module';
import { pointInPolygon } from '../../lib/geo/geo';
import { newId } from '../../model/ids';
import type { LngLat, Zone } from '../../model/types';

export const DRAW_TOOL = 'zones.draw';
export const SOURCES = { zones: 'zones', handles: 'zone-handles', draft: 'zone-draft' } as const;

const CLOSE_PX = 10;
const HANDLE_PX = 7;
const CLICK_PX = 3;

const ll = (e: MapMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];
const closed = (ring: LngLat[]) => (ring.length ? [...ring, ring[0]!] : ring);

/** Drawing zones, selecting them, and editing the selected zone's corners. */
export class ZoneEditor {
  #draft: LngLat[] = [];
  #cursor: LngLat | null = null;
  #drag: { id: string; index: number; insert: boolean; lngLat: LngLat; start: { x: number; y: number }; moved: boolean } | null = null;
  #frame = 0;

  constructor(
    private ctx: ModuleContext,
    private onCreated: (id: string) => void,
  ) {}

  get #drawing(): boolean {
    return get(this.ctx.ui.tool) === DRAW_TOOL;
  }

  get #selected(): Zone | undefined {
    const ids = this.ctx.selection.current;
    return ids.length === 1 ? this.ctx.store.get(ids[0]!, 'zone') : undefined;
  }

  attach(): () => void {
    const { map } = this.ctx;
    const click = (e: MapMouseEvent) => this.#onClick(e);
    const move = (e: MapMouseEvent) => this.#onMove(e);
    const down = (e: MapMouseEvent) => this.#onDown(e);
    const menu = (e: MapMouseEvent) => this.#onContextMenu(e);
    map.on('click', click);
    map.on('mousemove', move);
    map.on('mousedown', down);
    map.on('contextmenu', menu);
    const offTool = this.ctx.ui.tool.subscribe((tool) => {
      if (tool !== DRAW_TOOL) {
        this.#draft = [];
        this.#cursor = null;
      }
      this.refresh();
    });
    return () => {
      map.off('click', click);
      map.off('mousemove', move);
      map.off('mousedown', down);
      map.off('contextmenu', menu);
      offTool();
    };
  }

  /** Closes the polygon being drawn (needs three corners). */
  finish(): void {
    if (this.#draft.length < 3) return;
    const { commands, t, ui, selection } = this.ctx;
    const id = newId();
    commands.run({
      label: t('cmd.addZone'),
      changes: [
        edits.create<Zone>({
          id,
          type: 'zone',
          tripId: this.ctx.tripId,
          kind: 'avoid',
          polygon: [this.#draft.map((p) => [p[0], p[1]] as LngLat)],
          name: t('zone.newName'),
          reason: '',
          severity: 'nogo',
          addedAt: Date.now(),
        }),
      ],
    });
    this.#draft = [];
    ui.setTool(null);
    selection.set([id]);
    this.onCreated(id);
  }

  #onClick(e: MapMouseEvent): void {
    const { map, ui, store, selection } = this.ctx;
    if (this.#drawing) {
      const first = this.#draft[0];
      if (first && this.#draft.length >= 3) {
        const p = map.project(first);
        if (Math.hypot(p.x - e.point.x, p.y - e.point.y) <= CLOSE_PX) return this.finish();
      }
      this.#draft.push(ll(e));
      this.refresh();
      return;
    }
    if (get(ui.tool) || ui.claimed(e.originalEvent)) return;
    // Smallest zone under the click wins, so nested zones stay reachable.
    const hits = store.list('zone').filter((z) => pointInPolygon(ll(e), z.polygon));
    if (!hits.length) return;
    const span = (z: Zone) => {
      const r = z.polygon[0]!;
      return (Math.max(...r.map((c) => c[0])) - Math.min(...r.map((c) => c[0]))) * (Math.max(...r.map((c) => c[1])) - Math.min(...r.map((c) => c[1])));
    };
    ui.claim(e.originalEvent);
    selection.set([hits.sort((a, b) => span(a) - span(b))[0]!.id]);
  }

  #handleAt(point: { x: number; y: number }): { index: number; insert: boolean } | null {
    const zone = this.#selected;
    if (!zone) return null;
    const ring = zone.polygon[0]!;
    const { map } = this.ctx;
    const near = (p: LngLat) => {
      const q = map.project(p);
      return Math.hypot(q.x - point.x, q.y - point.y) <= HANDLE_PX;
    };
    const vertex = ring.findIndex(near);
    if (vertex >= 0) return { index: vertex, insert: false };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return { index: i + 1, insert: true };
    }
    return null;
  }

  #onDown(e: MapMouseEvent): void {
    if (get(this.ctx.ui.tool) || e.originalEvent.button !== 0) return;
    const zone = this.#selected;
    const handle = zone && this.#handleAt(e.point);
    if (!zone || !handle) return;
    e.preventDefault();
    this.#drag = { id: zone.id, ...handle, lngLat: ll(e), start: e.point, moved: false };
    document.addEventListener('mouseup', this.#endDrag, { once: true });
  }

  #endDrag = (): void => {
    const drag = this.#drag;
    this.#drag = null;
    const zone = drag && this.ctx.store.get(drag.id, 'zone');
    if (drag?.moved && zone) {
      const ring = [...zone.polygon[0]!];
      if (drag.insert) ring.splice(drag.index, 0, drag.lngLat);
      else ring[drag.index] = drag.lngLat;
      this.ctx.commands.run({
        label: this.ctx.t('cmd.editZone'),
        changes: [edits.update<Zone>(this.ctx.store, zone.id, { polygon: [ring, ...zone.polygon.slice(1)] })],
      });
    }
    this.refresh();
  };

  #onMove(e: MapMouseEvent): void {
    const { map } = this.ctx;
    if (this.#drag) {
      if (Math.hypot(e.point.x - this.#drag.start.x, e.point.y - this.#drag.start.y) > CLICK_PX) this.#drag.moved = true;
      this.#drag.lngLat = ll(e);
      this.refresh();
      return;
    }
    if (this.#drawing) {
      this.#cursor = ll(e);
      this.refresh();
      return;
    }
    if (!get(this.ctx.ui.tool) && this.#selected) {
      const handle = this.#handleAt(e.point);
      if (handle) map.getCanvas().style.cursor = 'grab';
      else if (map.getCanvas().style.cursor === 'grab') map.getCanvas().style.cursor = '';
    }
  }

  #onContextMenu(e: MapMouseEvent): void {
    const zone = this.#selected;
    const handle = zone && this.#handleAt(e.point);
    if (!zone || !handle || handle.insert) return;
    e.originalEvent.preventDefault();
    const ring = zone.polygon[0]!;
    if (ring.length <= 3) return;
    this.ctx.commands.run({
      label: this.ctx.t('cmd.editZone'),
      changes: [edits.update<Zone>(this.ctx.store, zone.id, { polygon: [ring.filter((_, i) => i !== handle.index), ...zone.polygon.slice(1)] })],
    });
  }

  refresh(): void {
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#render());
  }

  #render(): void {
    this.#frame = 0;
    const { map, store, selection } = this.ctx;
    const sel = new Set(selection.current);
    const drag = this.#drag?.moved ? this.#drag : null;

    const zones: GeoJSON.Feature[] = store.list('zone').map((z) => {
      let ring = z.polygon[0]!;
      if (drag?.id === z.id) {
        ring = [...ring];
        if (drag.insert) ring.splice(drag.index, 0, drag.lngLat);
        else ring[drag.index] = drag.lngLat;
      }
      return {
        type: 'Feature',
        properties: { id: z.id, name: z.name, severity: z.severity, kind: z.kind, selected: sel.has(z.id) },
        geometry: { type: 'Polygon', coordinates: [closed(ring), ...z.polygon.slice(1).map(closed)] },
      };
    });

    const handles: GeoJSON.Feature[] = [];
    const zone = this.#selected;
    if (zone && !this.#drawing) {
      const ring = zone.polygon[0]!;
      ring.forEach((p, i) => {
        const next = ring[(i + 1) % ring.length]!;
        handles.push(point(p, 'vertex'), point([(p[0] + next[0]) / 2, (p[1] + next[1]) / 2], 'mid'));
      });
    }

    const draft: GeoJSON.Feature[] = [];
    if (this.#drawing && this.#draft.length) {
      const ring = this.#cursor ? [...this.#draft, this.#cursor] : this.#draft;
      draft.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring.length > 2 ? closed(ring) : ring } });
      this.#draft.forEach((p, i) => draft.push(point(p, i === 0 ? 'first' : 'vertex')));
    }

    set(map, SOURCES.zones, zones);
    set(map, SOURCES.handles, handles);
    set(map, SOURCES.draft, draft);
  }
}

const point = (p: LngLat, kind: string): GeoJSON.Feature => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: p } });

function set(map: ModuleContext['map'], id: string, features: GeoJSON.Feature[]): void {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
}
