import { LngLatBounds, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl';
import { derived, get } from 'svelte/store';
import { POI_CATEGORIES, POI_CATEGORY_ORDER } from '../../config/pois';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import { addRoundIcon } from '../../lib/map-icons';
import { placeNameField } from '../../lib/map-prefs';
import { authorOf } from '../../lib/places/authors';
import { folderOf, folderPlaces } from '../../lib/places/folders';
import { createPoiCommand } from '../../lib/places/poi';
import type { LngLat, Poi } from '../../model/types';
import PlacesSection from './PlacesSection.svelte';
import FolderCard from './FolderCard.svelte';
import PoiCard from './PoiCard.svelte';

const SOURCE = 'pois';
const ADD_TOOL = 'pois.add';
const CLICK_PX = 3;

export default defineModule({
  id: 'pois',
  setup(ctx) {
    const { map, store, layers, ui, selection, commands, shortcuts, prefs, t } = ctx;

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
    // Size and labels from the Settings window.
    const offSize = prefs.watch('placeSize', (s) => {
      map.setLayoutProperty('pois', 'icon-size', ['case', ['==', ['get', 'status'], 'mustSee'], 1.1 * s, s]);
      map.setLayoutProperty('pois', 'text-offset', [0, 1.4 * s]);
      map.setPaintProperty('pois-ring', 'circle-radius', ['case', ['get', 'selected'], 18 * s, 16 * s]);
    });
    const offNames = prefs.watch('placeNames', (names) => map.setLayoutProperty('pois', 'text-field', placeNameField(names)));
    // Who added each place: a dot in their colour, on shared trips.
    layers.addLayer(
      {
        id: 'pois-author',
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'author'],
        paint: {
          'circle-radius': 4.5,
          'circle-color': ['get', 'author'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-translate': [9, -9],
          'circle-opacity': ['case', ['==', ['get', 'status'], 'skip'], 0.45, 1],
          'circle-stroke-opacity': ['case', ['==', ['get', 'status'], 'skip'], 0.45, 1],
        },
      },
      'poi',
    );
    const offAuthorSize = prefs.watch('placeSize', (s) => {
      map.setPaintProperty('pois-author', 'circle-radius', 4.5 * s);
      map.setPaintProperty('pois-author', 'circle-translate', [9 * s, -9 * s]);
    });
    const removePointLayer = ui.addPointLayer('pois');
    const removeOverlay = layers.registerOverlay({ id: 'pois', label: t('poi.overlay'), layerIds: ['pois', 'pois-ring', 'pois-author'], visible: true, order: 10, group: 'trip' });

    // Rendering
    let dragging: { id: string; lngLat: LngLat } | null = null;
    let frame = 0;
    const render = () => {
      frame = 0;
      const sel = new Set(selection.current);
      const authors = get(ctx.cloud.shared) && prefs.current.placeAuthors;
      const hidden = get(ctx.visibility.hidden);
      // Places in a hidden folder are left off the map; those in a selected folder are highlighted.
      const shown = store.list('poi').filter((p) => !(p.folderId && hidden.has(p.folderId) && folderOf(store, p)));
      const features: GeoJSON.Feature[] = shown.map((p) => ({
        type: 'Feature',
        properties: {
          id: p.id,
          category: p.category,
          status: p.status,
          name: p.name,
          selected: sel.has(p.id) || (!!p.folderId && sel.has(p.folderId)),
          ...(authors ? { author: authorOf(ctx.cloud, t, p.createdBy).color } : {}),
        },
        geometry: { type: 'Point', coordinates: dragging?.id === p.id ? dragging.lngLat : p.lngLat },
      }));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    const offStore = store.onChange(({ ids }) => {
      if (ids.some((id) => store.getRaw(id)?.type === 'poi' || store.getRaw(id)?.type === 'poiFolder')) schedule();
    });
    const offSelection = ctx.bus.on('selection:changed', schedule);
    const offPeople = [ctx.cloud.shared, ctx.cloud.members, ctx.cloud.profile].map((s) => s.subscribe(schedule));
    const offAuthors = prefs.watch('placeAuthors', schedule);
    const offHidden = ctx.visibility.hidden.subscribe(schedule);
    schedule();

    // Adding, selecting and dragging
    const tool = derived(ui.tool, (v) => v === ADD_TOOL);
    const toggleAdd = () => ui.toggleTool(ADD_TOOL);

    const onClick = (e: MapMouseEvent) => {
      if (get(ui.tool) !== ADD_TOOL) return;
      // The click ends the tool; claim it so other map click handlers don't take it too.
      ui.claim(e.originalEvent);
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
    /** Selects a folder and brings its places into view if some are off screen. */
    const focusFolder = (id: string) => {
      selection.set([id]);
      const places = folderPlaces(store, id);
      if (!places.length) return;
      const bounds = new LngLatBounds();
      for (const p of places) bounds.extend(p.lngLat);
      const view = map.getBounds();
      if (view.contains(bounds.getSouthWest()) && view.contains(bounds.getNorthEast())) return;
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 380, right: 340 }, maxZoom: 13 });
    };

    const removeCard = ui.addCardRenderer('poi', { component: PoiCard, props: { ctx } });
    const removeFolderCard = ui.addCardRenderer('poiFolder', { component: FolderCard, props: { ctx } });
    const removeSection = ui.addPanelSection({ id: 'pois', title: t('poi.title'), component: PlacesSection, props: { ctx, focus, focusFolder }, order: 15 });

    return () => {
      offStore();
      offSelection();
      offSize();
      offNames();
      offAuthorSize();
      offAuthors();
      offHidden();
      offPeople.forEach((off) => off());
      removeFolderCard();
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
