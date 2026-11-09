import { LngLatBounds } from 'maplibre-gl';
import { derived } from 'svelte/store';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import type { Segment } from '../../model/types';
import { rerouteThrough, segmentsCrossing } from './crossings';
import { DRAW_TOOL, SOURCES, ZoneEditor } from './editor';
import SegmentZones from './SegmentZones.svelte';
import ZoneCard from './ZoneCard.svelte';
import ZonesSection from './ZonesSection.svelte';

const COLORS = { nogo: '#e03131', caution: '#f08c00', risk: '#862e9c' } as const;

/** Diagonal hatching, drawn on a canvas. */
function hatch(color: string): ImageData {
  const size = 16;
  const ratio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * ratio;
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.beginPath();
  for (const o of [-size, 0, size]) {
    g.moveTo(o, size);
    g.lineTo(o + size, 0);
  }
  g.stroke();
  return g.getImageData(0, 0, size * ratio, size * ratio);
}

export default defineModule({
  id: 'zones',
  setup(ctx) {
    const { map, layers, ui, store, commands, selection, shortcuts, t } = ctx;

    for (const [sev, color] of Object.entries(COLORS)) {
      if (!map.hasImage(`zone-hatch-${sev}`)) map.addImage(`zone-hatch-${sev}`, hatch(color), { pixelRatio: 2 });
    }
    for (const id of Object.values(SOURCES)) layers.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Risk zones (information only) are purple; avoid zones red (no-go) or orange (caution).
    const color = ['case', ['==', ['get', 'kind'], 'risk'], COLORS.risk, ['==', ['get', 'severity'], 'nogo'], COLORS.nogo, COLORS.caution] as never;
    layers.addLayer(
      {
        id: 'zones-fill',
        type: 'fill',
        source: SOURCES.zones,
        paint: { 'fill-pattern': ['case', ['==', ['get', 'kind'], 'risk'], 'zone-hatch-risk', ['concat', 'zone-hatch-', ['get', 'severity']]] },
      },
      'overlay',
    );
    layers.addLayer(
      {
        id: 'zones-line',
        type: 'line',
        source: SOURCES.zones,
        paint: { 'line-color': color, 'line-width': ['case', ['get', 'selected'], 3.5, 2], 'line-dasharray': [3, 1.5] },
      },
      'overlay',
    );
    layers.addLayer(
      {
        id: 'zones-label',
        type: 'symbol',
        source: SOURCES.zones,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-max-width': 8 },
        paint: { 'text-color': color, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      'overlay',
    );
    layers.addLayer(
      {
        id: 'zone-draft',
        type: 'line',
        source: SOURCES.draft,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': COLORS.nogo, 'line-width': 2, 'line-dasharray': [2, 1] },
      },
      'top',
    );
    layers.addLayer(
      {
        id: 'zone-points',
        type: 'circle',
        source: SOURCES.draft,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': ['match', ['get', 'kind'], 'first', 6, 4], 'circle-color': '#ffffff', 'circle-stroke-color': COLORS.nogo, 'circle-stroke-width': 2 },
      },
      'top',
    );
    layers.addLayer(
      {
        id: 'zone-handles',
        type: 'circle',
        source: SOURCES.handles,
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'mid', 3.5, 5],
          'circle-color': ['match', ['get', 'kind'], 'mid', COLORS.nogo, '#ffffff'],
          'circle-opacity': ['match', ['get', 'kind'], 'mid', 0.6, 1],
          'circle-stroke-color': COLORS.nogo,
          'circle-stroke-width': 2,
        },
      },
      'top',
    );
    const removeOverlay = layers.registerOverlay({
      id: 'zones',
      label: t('zone.overlayAll'),
      layerIds: ['zones-fill', 'zones-line', 'zones-label'],
      visible: true,
      order: 20,
    });

    /** Sends legs that enter these no-go zones back to the router. Returns how many segments changed. */
    const reroute = (zoneIds: string[], only?: Segment[]): number => {
      const zones = zoneIds.map((id) => store.get(id, 'zone')).filter((z) => !!z && z.severity === 'nogo');
      const segments = only ?? store.list('segment');
      const changes = segments.flatMap((s) => {
        const g = rerouteThrough(s, zones as NonNullable<(typeof zones)[number]>[]);
        return g ? [edits.update<Segment>(store, s.id, g)] : [];
      });
      if (changes.length) commands.run({ label: t('cmd.reroute'), changes });
      return changes.length;
    };
    const rerouteSegment = (id: string) => {
      const seg = store.get(id, 'segment');
      return !!seg && reroute(store.list('zone').map((z) => z.id), [seg]) > 0;
    };

    const editor = new ZoneEditor(ctx, (id) => {
      const zone = store.get(id, 'zone');
      const crossing = zone ? segmentsCrossing(zone, store.list('segment')).filter((s) => s.geomType === 'routed') : [];
      if (crossing.length) {
        ui.notify(t('zone.newCrossed', { n: crossing.length }), 'warn', 15_000, { label: t('zone.reroute'), run: () => reroute([id]) });
      }
    });
    const detach = editor.attach();
    const offStore = store.onChange(({ ids }) => {
      if (ids.some((id) => store.getRaw(id)?.type === 'zone')) editor.refresh();
    });
    const offSelection = ctx.bus.on('selection:changed', () => editor.refresh());
    editor.refresh();

    const focus = (id: string) => {
      selection.set([id]);
      const e = store.get(id);
      const coords = e?.type === 'zone' ? e.polygon[0]! : e?.type === 'segment' ? e.anchors.map((a) => a.lngLat) : [];
      if (!coords.length) return;
      const b = new LngLatBounds();
      coords.forEach((c) => b.extend(c));
      const view = map.getBounds();
      if (!view.contains(b.getSouthWest()) || !view.contains(b.getNorthEast())) map.fitBounds(b, { padding: 80, maxZoom: 13 });
    };

    const toggle = () => ui.toggleTool(DRAW_TOOL);
    const drawing = derived(ui.tool, (v) => v === DRAW_TOOL);
    let offEnter: (() => void) | null = null;
    const offDrawing = drawing.subscribe((on) => {
      offEnter?.();
      offEnter = on ? shortcuts.add({ keys: 'enter', label: t('zone.add'), run: () => editor.finish() }) : null;
      if (on) ui.notify(t('zone.drawHint'), 'info', 5000);
    });

    const removers = [
      ui.addTool({ id: DRAW_TOOL, label: t('zone.add'), icon: icons.zone, shortcut: 'a', order: 35, active: drawing, run: toggle }),
      shortcuts.add({ keys: 'a', label: t('zone.add'), run: toggle }),
      ui.addCardRenderer('zone', { component: ZoneCard, props: { ctx, reroute, focus } }),
      ui.addCardSection({ id: 'zones.segment', component: SegmentZones, props: { ctx, rerouteSegment }, types: ['segment'], order: 2 }),
      ui.addPanelSection({ id: 'zones', title: t('zone.title'), component: ZonesSection, props: { ctx, focus }, order: 16 }),
    ];

    return () => {
      detach();
      offStore();
      offSelection();
      offDrawing();
      offEnter?.();
      removeOverlay();
      removers.forEach((off) => off());
    };
  },
});
