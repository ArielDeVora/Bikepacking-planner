import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl';
import { derived, get } from 'svelte/store';
import { POI_CATEGORIES, POI_CATEGORY_ORDER } from '../../config/pois';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import { addRoundIcon } from '../../lib/map-icons';
import { createPoiCommand } from '../../lib/places/poi';
import type { LngLat, Poi } from '../../model/types';
import PlacesSection from './PlacesSection.svelte';
import PoiCard from './PoiCard.svelte';

const SOURCE = 'pois';
const ADD_TOOL = 'pois.add';
const CLICK_PX = 3;

export default defineModule({
  id: 'pois',
  setup(ctx) {
    const { map, store, layers, ui, selection, commands, shortcuts, t } = ctx;

    for (const cat of POI_CATEGORY_ORDER) addRoundIcon(map, `poi-${cat}`, POI_CATEGORIES[cat].icon, POI_CATEGORIES[cat].color);

    layers.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: 'pois-ring',
        type: 'circle',
        source: SOURCE,
        filter: ['any', ['in', ['get', 'status'], ['literal', ['mustSee', 'booked']]], ['get', 'selected']],
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 18, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2.5],
          'circle-stroke-color': [
            'case',
            ['get', 'selected'],
            '#212529',
            ['==', ['get', 'status'], 'booked'],
            '#2f9e44',
            '#f59f00',
          ],
        },
      },
      'poi',
    );
    layers.addLayer(
      {
        id: 'pois',
        type: 'symbol',
        source: SOURCE,
        layout: {
          'icon-image': ['concat', 'poi-', ['get', 'category']],
          'icon-size': ['case', ['==', ['get', 'status'], 'mustSee'], 1.1, 1],
          'icon-allow-overlap': true,
          'text-field': ['step', ['zoom'], '', 11, ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
          'text-max-width': 10,
        },
        paint: {
          'icon-opacity': ['case', ['==', ['get', 'status'], 'skip'], 0.45, 1],
          'text-color': '#212529',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      },
      'poi',
    );
    const removePointLayer = ui.addPointLayer('pois');
    const removeOverlay = layers.registerOverlay({ id: 'pois', label: t('poi.overlay'), layerIds: ['pois', 'pois-ring'], visible: true, order: 10, group: 'trip' });

    // Rendering
    let dragging: { id: string; lngLat: LngLat } | null = null;
    let frame = 0;
    const render = () => {
      frame = 0;
      const sel = new Set(selection.current);
      const features: GeoJSON.Feature[] = store.list('poi').map((p) => ({
        type: 'Feature',
        properties: { id: p.id, category: p.category, status: p.status, name: p.name, selected: sel.has(p.id) },
        geometry: { type: 'Point', coordinates: dragging?.id === p.id ? dragging.lngLat : p.lngLat },
      }));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    const offStore = store.onChange(({ ids }) => {
      if (ids.some((id) => store.getRaw(id)?.type === 'poi')) schedule();
    });
    const offSelection = ctx.bus.on('selection:changed', schedule);
    schedule();

    // Adding, selecting and dragging
    const tool = derived(ui.tool, (v) => v === ADD_TOOL);
    const toggleAdd = () => ui.toggleTool(ADD_TOOL);

    const onClick = (e: MapMouseEvent) => {
      if (get(ui.tool) !== ADD_TOOL) return;
      const { command, id } = createPoiCommand(
        { tripId: ctx.tripId, userId: ctx.user.id, lngLat: [e.lngLat.lng, e.lngLat.lat], name: t('poi.newName'), category: 'other' },
        t('cmd.addPoi'),
      );
      commands.run(command);
      ui.setTool(null);
      selection.set([id]);
    };
    const onPoiClick = (e: MapLayerMouseEvent) => {
      if (get(ui.tool)) return;
      const id = e.features?.[0]?.properties.id as string | undefined;
      if (!id) return;
      ui.claim(e.originalEvent);
      selection.set([id]);
    };
    const onPoiDown = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties.id as string | undefined;
      const poi = id ? store.get(id, 'poi') : undefined;
      if (!poi || get(ui.tool) || e.originalEvent.button !== 0 || !selection.current.includes(poi.id)) return;
      e.preventDefault();
      const start = e.point;
      let moved = false;
      map.getCanvas().style.cursor = 'grabbing';
      const move = (ev: MapMouseEvent) => {
        if (!moved && Math.hypot(ev.point.x - start.x, ev.point.y - start.y) <= CLICK_PX) return;
        moved = true;
        dragging = { id: poi.id, lngLat: [ev.lngLat.lng, ev.lngLat.lat] };
        schedule();
      };
      const up = () => {
        map.off('mousemove', move);
        map.getCanvas().style.cursor = '';
        const done = dragging;
        dragging = null;
        if (moved && done) commands.run({ label: t('cmd.movePoi'), changes: [edits.update<Poi>(store, poi.id, { lngLat: done.lngLat })] });
        else schedule();
      };
      map.on('mousemove', move);
      document.addEventListener('mouseup', up, { once: true });
    };
    const onEnter = () => {
      if (!get(ui.tool)) map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      if (!get(ui.tool) && !dragging) map.getCanvas().style.cursor = '';
    };
    map.on('click', onClick);
    map.on('click', 'pois', onPoiClick);
    map.on('mousedown', 'pois', onPoiDown);
    map.on('mouseenter', 'pois', onEnter);
    map.on('mouseleave', 'pois', onLeave);

    const focus = (id: string) => {
      const poi = store.get(id, 'poi');
      if (!poi) return;
      selection.set([id]);
      if (!map.getBounds().contains(poi.lngLat)) map.flyTo({ center: poi.lngLat, zoom: Math.max(map.getZoom(), 13) });
    };

    const removeTool = ui.addTool({ id: ADD_TOOL, label: t('poi.add'), icon: icons.pin, shortcut: 'p', order: 30, active: tool, run: toggleAdd });
    const removeShortcut = shortcuts.add({ keys: 'p', label: t('poi.add'), run: toggleAdd });
    const removeCard = ui.addCardRenderer('poi', { component: PoiCard, props: { ctx } });
    const removeSection = ui.addPanelSection({ id: 'pois', title: t('poi.title'), component: PlacesSection, props: { ctx, focus }, order: 15 });

    return () => {
      offStore();
      offSelection();
      removeOverlay();
      removePointLayer();
      removeTool();
      removeShortcut();
      removeCard();
      removeSection();
      map.off('click', onClick);
      map.off('click', 'pois', onPoiClick);
      map.off('mousedown', 'pois', onPoiDown);
      map.off('mouseenter', 'pois', onEnter);
      map.off('mouseleave', 'pois', onLeave);
    };
  },
});
