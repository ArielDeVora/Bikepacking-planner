import { KEYS } from '../../config/shortcuts';
import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapLayerTouchEvent, type MapMouseEvent, type MapTouchEvent } from 'maplibre-gl';
import { derived, get } from 'svelte/store';
import { POI_CATEGORIES, POI_CATEGORY_ORDER } from '../../config/pois';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import { addCrownIcon, addRoundIcon, setRoundIcon } from '../../lib/map-icons';
import { placeNameField } from '../../lib/map-prefs';
import { authorOf } from '../../lib/places/authors';
import { categoryPlaces, categoryVisibilityId, customCategories, iconPath, legacyFolderChanges, resolveCategory } from '../../lib/places/categories';
import { createPoiCommand } from '../../lib/places/poi';
import { approvals, CROWN_APPROVALS, votesByPlace } from '../../lib/places/votes';
import type { LngLat, Poi } from '../../model/types';
import CategoryCard from './CategoryCard.svelte';
import PlacesSection from './PlacesSection.svelte';
import PoiCard from './PoiCard.svelte';

const SOURCE = 'pois';
const ADD_TOOL = 'pois.add';
const CLICK_PX = 3;

// Status styles, scaled by the "Size of your places" setting: must-see places are a bit bigger
// with a gold ring; GOATED ones bigger still, with a thicker ring and a gold glow.
const isStatus = (s: string): ExpressionSpecification => ['==', ['get', 'status'], s];
const iconSize = (s: number): ExpressionSpecification => ['case', isStatus('goated'), 1.25 * s, isStatus('mustSee'), 1.1 * s, s];
const ringRadius = (s: number): ExpressionSpecification => ['case', isStatus('goated'), 20 * s, ['get', 'selected'], 18 * s, 16 * s];
const GLOW_RADIUS = 28;
/** The crown sits on top of the icon (26 px, larger for must-see and GOATED), overlapping its rim a little. */
const CROWN_OFFSET: ExpressionSpecification = ['case', isStatus('goated'), ['literal', [0, -13]], isStatus('mustSee'), ['literal', [0, -11]], ['literal', [0, -10]]];

export default defineModule({
  id: 'pois',
  setup(ctx) {
    const { map, store, layers, ui, selection, commands, shortcuts, prefs, t } = ctx;

    for (const cat of POI_CATEGORY_ORDER) addRoundIcon(map, `poi-${cat}`, POI_CATEGORIES[cat].icon, POI_CATEGORIES[cat].color);
    // Custom categories' icons, redrawn when someone changes their symbol or colour.
    const drawn = new Map<string, string>();
    const syncCustomIcons = () => {
      for (const f of customCategories(store)) {
        const look = `${f.icon}|${f.color}`;
        if (drawn.get(f.id) === look) continue;
        drawn.set(f.id, look);
        setRoundIcon(map, `poi-${f.id}`, iconPath(f.icon), f.color ?? '#868e96');
      }
    };
    syncCustomIcons();

    layers.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: 'pois-glow',
        type: 'circle',
        source: SOURCE,
        filter: isStatus('goated'),
        // Transparency in the colour, so the overlay's opacity slider can still scale it.
        paint: { 'circle-radius': GLOW_RADIUS, 'circle-color': 'rgba(252, 196, 25, 0.75)', 'circle-blur': 0.55 },
      },
      'poi',
    );
    layers.addLayer(
      {
        id: 'pois-ring',
        type: 'circle',
        source: SOURCE,
        filter: ['any', ['in', ['get', 'status'], ['literal', ['mustSee', 'goated']]], ['get', 'selected']],
        paint: {
          'circle-radius': ringRadius(1),
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': ['case', isStatus('goated'), 3.5, ['get', 'selected'], 3, 2.5],
          'circle-stroke-color': ['case', ['get', 'selected'], '#212529', '#f59f00'],
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
          'icon-size': iconSize(1),
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
      map.setLayoutProperty('pois', 'icon-size', iconSize(s));
      map.setLayoutProperty('pois', 'text-offset', [0, 1.4 * s]);
      map.setPaintProperty('pois-ring', 'circle-radius', ringRadius(s));
      map.setPaintProperty('pois-glow', 'circle-radius', GLOW_RADIUS * s);
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
    // A crown on places enough people approve of.
    addCrownIcon(map, 'poi-crown');
    layers.addLayer(
      {
        id: 'pois-crown',
        type: 'symbol',
        source: SOURCE,
        filter: ['get', 'crowned'],
        layout: {
          'icon-image': 'poi-crown',
          'icon-anchor': 'bottom',
          'icon-offset': CROWN_OFFSET,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      'poi',
    );
    const offCrownSize = prefs.watch('placeSize', (s) => map.setLayoutProperty('pois-crown', 'icon-size', s));
    const removePointLayer = ui.addPointLayer('pois');
    const removeOverlay = layers.registerOverlay({
      id: 'pois',
      label: t('poi.overlay'),
      layerIds: ['pois', 'pois-ring', 'pois-glow', 'pois-author', 'pois-crown'],
      visible: true,
      order: 10,
      group: 'trip',
    });

    // Rendering
    let dragging: { id: string; lngLat: LngLat } | null = null;
    let frame = 0;
    const render = () => {
      frame = 0;
      const sel = new Set(selection.current);
      const authors = get(ctx.cloud.shared) && prefs.current.placeAuthors;
      const hidden = get(ctx.visibility.hidden);
      const votes = votesByPlace(store);
      // Places of a hidden category are left off the map; those of a selected custom category are highlighted.
      const features: GeoJSON.Feature[] = [];
      for (const p of store.list('poi')) {
        const category = resolveCategory(store, p.category);
        if (hidden.has(categoryVisibilityId(category))) continue;
        features.push({
        type: 'Feature',
        properties: {
          id: p.id,
          category,
          status: p.status,
          name: p.name,
          selected: sel.has(p.id) || sel.has(category),
          crowned: approvals(votes.get(p.id) ?? []) >= CROWN_APPROVALS,
          ...(authors ? { author: authorOf(ctx.cloud, t, p.createdBy, p.suggestedBy).color } : {}),
        },
        geometry: { type: 'Point', coordinates: dragging?.id === p.id ? dragging.lngLat : p.lngLat },
        });
      }
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    // Older data, or from someone on an older version, brought up to date without an undo step:
    // "booked" places become must-see, and a place's folder becomes its category.
    const upgrade = (ids?: string[]) => {
      const pois = ids ? ids.map((id) => store.get(id, 'poi')).filter((p): p is Poi => !!p) : store.list('poi');
      if (!pois.some((p) => (p.status as string) === 'booked' || p.folderId !== undefined)) return;
      queueMicrotask(() => {
        const current = pois.map((p) => store.get(p.id, 'poi')).filter((p): p is Poi => !!p);
        commands.patch(legacyFolderChanges(store, current));
        const booked = current.map((p) => store.get(p.id, 'poi')!).filter((p) => (p.status as string) === 'booked');
        commands.patch(booked.map((p) => edits.update<Poi>(store, p.id, { status: 'mustSee' })));
      });
    };
    upgrade();

    const offStore = store.onChange(({ ids }) => {
      const types = new Set(ids.map((id) => store.getRaw(id)?.type));
      if (types.has('poiFolder')) syncCustomIcons();
      if (types.has('poi') || types.has('poiFolder') || types.has('vote') || types.has('trip')) schedule();
      upgrade(ids);
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
        { tripId: ctx.tripId, userId: ctx.user.id, lngLat: [e.lngLat.lng, e.lngLat.lat], name: t('poi.newName'), category: resolveCategory(store, 'other') },
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
    // On a touch screen: a selected place follows the finger (one finger; two still move the map).
    const onPoiTouch = (e: MapLayerTouchEvent) => {
      const id = e.features?.[0]?.properties.id as string | undefined;
      const poi = id ? store.get(id, 'poi') : undefined;
      if (!poi || get(ui.tool) || e.points.length !== 1 || !selection.current.includes(poi.id)) return;
      e.preventDefault();
      map.dragPan.disable();
      const start = e.point;
      let moved = false;
      const move = (ev: MapTouchEvent) => {
        if (ev.points.length !== 1) return;
        if (!moved && Math.hypot(ev.point.x - start.x, ev.point.y - start.y) <= CLICK_PX * 3) return;
        moved = true;
        dragging = { id: poi.id, lngLat: [ev.lngLat.lng, ev.lngLat.lat] };
        schedule();
      };
      const end = () => {
        map.off('touchmove', move);
        map.off('touchend', end);
        map.off('touchcancel', end);
        map.dragPan.enable();
        const done = dragging;
        dragging = null;
        if (moved && done) commands.run({ label: t('cmd.movePoi'), changes: [edits.update<Poi>(store, poi.id, { lngLat: done.lngLat })] });
        else schedule();
      };
      map.on('touchmove', move);
      map.on('touchend', end);
      map.on('touchcancel', end);
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
    map.on('touchstart', 'pois', onPoiTouch);
    map.on('mouseenter', 'pois', onEnter);
    map.on('mouseleave', 'pois', onLeave);

    const focus = (id: string) => {
      const poi = store.get(id, 'poi');
      if (!poi) return;
      selection.set([id]);
      if (!map.getBounds().contains(poi.lngLat)) map.flyTo({ center: poi.lngLat, zoom: Math.max(map.getZoom(), 13) });
    };

    const removeTool = ui.addTool({ id: ADD_TOOL, label: t('poi.add'), icon: icons.pin, shortcut: KEYS.addPlace, order: 30, active: tool, run: toggleAdd });
    const removeShortcut = shortcuts.add({ keys: KEYS.addPlace, label: t('poi.add'), run: toggleAdd });
    /**
     * Selects a category (a custom one opens its card; a built-in one selects its places) and
     * brings its places into view if some are off screen.
     */
    const focusCategory = (id: string) => {
      const places = categoryPlaces(store, id);
      selection.set(store.get(id, 'poiFolder') ? [id] : places.map((p) => p.id));
      if (!places.length) return;
      const bounds = new LngLatBounds();
      for (const p of places) bounds.extend(p.lngLat);
      const view = map.getBounds();
      if (view.contains(bounds.getSouthWest()) && view.contains(bounds.getNorthEast())) return;
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 380, right: 340 }, maxZoom: 13 });
    };

    const removeCard = ui.addCardRenderer('poi', { component: PoiCard, props: { ctx } });
    const removeCategoryCard = ui.addCardRenderer('poiFolder', { component: CategoryCard, props: { ctx } });
    const removeSection = ui.addPanelSection({ id: 'pois', title: t('poi.title'), component: PlacesSection, props: { ctx, focus, focusCategory }, order: 15 });

    return () => {
      offStore();
      offSelection();
      offSize();
      offNames();
      offAuthorSize();
      offCrownSize();
      offAuthors();
      offHidden();
      offPeople.forEach((off) => off());
      removeCategoryCard();
      removeOverlay();
      removePointLayer();
      removeTool();
      removeShortcut();
      removeCard();
      removeSection();
      map.off('click', onClick);
      map.off('click', 'pois', onPoiClick);
      map.off('mousedown', 'pois', onPoiDown);
      map.off('touchstart', 'pois', onPoiTouch);
      map.off('mouseenter', 'pois', onEnter);
      map.off('mouseleave', 'pois', onLeave);
    };
  },
});
