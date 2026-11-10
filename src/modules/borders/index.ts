import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { get, writable } from 'svelte/store';
import { POI_ICONS } from '../../config/pois';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { distance } from '../../lib/geo/geo';
import { addRoundIcon } from '../../lib/map-icons';
import { newId } from '../../model/ids';
import { segmentCoords } from '../../model/segment';
import type { BorderCrossing, CrossingStatus } from '../../model/types';
import BorderCard from './BorderCard.svelte';
import BordersSection from './BordersSection.svelte';
import { loadCountries, type CountryIndex } from '../../lib/countries';
import { tripSegments } from '../../lib/tree';
import { findCrossings, type Crossing, type CrossingState, type TripLine } from './countries';
import CrossingCard from './CrossingCard.svelte';
import { postsNear, type BorderPost } from './posts';

const VECTOR = 'openmaptiles';
const BORDER_COLOR = '#5f3dc4';
const STATUS_COLORS: Record<CrossingStatus, string> = { open: '#2f9e44', closedToForeigners: '#e03131', unknown: '#868e96' };
/** An annotation this close to a detected crossing (or its border post) belongs to it. */
const MATCH_M = 5000;
const RECOMPUTE_MS = 2000;

export default defineModule({
  id: 'borders',
  setup(ctx) {
    const { map, layers, ui, store, commands, selection, settings, t } = ctx;
    const removers: (() => void)[] = [];

    // Country borders, stronger than the base map's, at every zoom and on every base map.
    if (map.getSource(VECTOR)) {
      const borderFilter = ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]] as const;
      const width = (a: number, b: number) => ['interpolate', ['linear'], ['zoom'], 2, a, 10, b] as const;
      layers.addLayer(
        {
          id: 'borders-casing',
          type: 'line',
          source: VECTOR,
          'source-layer': 'boundary',
          filter: [...borderFilter, ['!=', ['get', 'disputed'], 1]] as never,
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': width(3, 7) as never, 'line-opacity': 0.7 },
        },
        'overlay',
      );
      layers.addLayer(
        {
          id: 'borders-line',
          type: 'line',
          source: VECTOR,
          'source-layer': 'boundary',
          filter: [...borderFilter, ['!=', ['get', 'disputed'], 1]] as never,
          layout: { 'line-join': 'round' },
          paint: { 'line-color': BORDER_COLOR, 'line-width': width(1, 2.5) as never },
        },
        'overlay',
      );
      layers.addLayer(
        {
          id: 'borders-disputed',
          type: 'line',
          source: VECTOR,
          'source-layer': 'boundary',
          filter: [...borderFilter, ['==', ['get', 'disputed'], 1]] as never,
          paint: { 'line-color': BORDER_COLOR, 'line-width': width(1, 2.5) as never, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
        },
        'overlay',
      );
      // Country names for the raster base maps (the vector base map has its own).
      layers.addLayer(
        {
          id: 'borders-labels',
          type: 'symbol',
          source: VECTOR,
          'source-layer': 'place',
          filter: ['==', ['get', 'class'], 'country'],
          minzoom: 2,
          maxzoom: 9,
          layout: {
            'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
            'text-font': ['Noto Sans Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 15],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.08,
            'text-max-width': 8,
            visibility: 'none',
          },
          paint: { 'text-color': BORDER_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        },
        'overlay',
      );
      const syncLabels = () => {
        const baseShown = map.getLayer('label_country_1') && map.getLayoutProperty('label_country_1', 'visibility') !== 'none';
        const want = baseShown ? 'none' : 'visible';
        if (map.getLayoutProperty('borders-labels', 'visibility') !== want) map.setLayoutProperty('borders-labels', 'visibility', want);
      };
      map.on('styledata', syncLabels);
      syncLabels();
      removers.push(() => map.off('styledata', syncLabels));
      removers.push(
        layers.registerOverlay({ id: 'borders', label: t('border.overlay'), layerIds: ['borders-casing', 'borders-line', 'borders-disputed'], visible: true, order: 15, group: 'map' }),
      );
    }

    // Our crossing annotations, and the crossings found along the trip.
    for (const [status, color] of Object.entries(STATUS_COLORS)) addRoundIcon(map, `crossing-${status}`, POI_ICONS.flag, color, 26);
    addRoundIcon(map, 'crossing-detected', POI_ICONS.flag, BORDER_COLOR, 24, false);
    for (const id of ['border-crossings', 'border-detected']) layers.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: 'border-detected',
        type: 'symbol',
        source: 'border-detected',
        layout: { 'icon-image': 'crossing-detected', 'icon-allow-overlap': true },
      },
      'poi',
    );
    layers.addLayer(
      {
        id: 'border-detected-label',
        type: 'symbol',
        source: 'border-detected',
        minzoom: 6,
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': BORDER_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      'poi',
    );
    layers.addLayer(
      {
        id: 'border-crossings',
        type: 'symbol',
        source: 'border-crossings',
        layout: { 'icon-image': ['concat', 'crossing-', ['get', 'status']], 'icon-allow-overlap': true },
      },
      'poi',
    );
    removers.push(ui.addPointLayer('border-crossings'), ui.addPointLayer('border-detected'));
    removers.push(
      ctx.prefs.watch('placeSize', (s) => {
        for (const id of ['border-detected', 'border-crossings']) map.setLayoutProperty(id, 'icon-size', s);
        map.setLayoutProperty('border-detected-label', 'text-offset', [0, 1.3 * s]);
      }),
    );
    removers.push(
      layers.registerOverlay({
        id: 'border-crossings',
        label: t('border.crossingsOverlay'),
        layerIds: ['border-detected', 'border-detected-label', 'border-crossings'],
        visible: true,
        order: 16,
        group: 'trip',
      }),
    );

    const crossings = writable<CrossingState>({ status: 'idle', crossings: [] });
    let index: CountryIndex | null = null;

    const setData = (id: string, features: GeoJSON.Feature[]) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });

    const renderAnnotations = () =>
      setData(
        'border-crossings',
        store.list('borderCrossing').map((b) => ({ type: 'Feature', properties: { id: b.id, status: b.status }, geometry: { type: 'Point', coordinates: b.lngLat } })),
      );
    // Pins for the crossings found: on the nearest OSM border post once known, hidden where we
    // already have notes (their own coloured pin shows instead).
    const posts = new Map<Crossing, BorderPost>();
    const renderDetected = (list: Crossing[]) =>
      setData(
        'border-detected',
        list.flatMap((c, i) => {
          const post = posts.get(c);
          if (nearest(c, post ? [post] : [])) return [];
          return [{ type: 'Feature', properties: { i, label: `${c.from.code} → ${c.to.code}` }, geometry: { type: 'Point', coordinates: post?.lngLat ?? c.lngLat } }];
        }),
      );

    /** Looks up border posts for each crossing in the background (one request at a time, cached). */
    let lookup = 0;
    async function findPosts(list: Crossing[]): Promise<void> {
      const run = ++lookup;
      for (const c of list) {
        if (run !== lookup) return;
        const found = await postsNear(c.lngLat);
        if (found?.[0]) {
          posts.set(c, found[0]);
          renderDetected(list);
        }
      }
    }

    const tripLines = (): TripLine[] =>
      tripSegments(store).map((s) => ({ segmentId: s.id, endsOnly: s.mode === 'plane' || s.mode === 'boat', coords: segmentCoords(s) }));

    async function compute(): Promise<void> {
      try {
        if (!index) {
          crossings.set({ status: 'loading', crossings: [] });
          index = await loadCountries();
        }
        const list = findCrossings(index, tripLines());
        crossings.set({ status: 'ready', crossings: list });
        renderDetected(list);
        void findPosts(list);
        settings.set('auto', true);
      } catch (err) {
        console.warn(err);
        crossings.set({ status: 'error', crossings: [] });
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const offStore = store.onChange(({ ids }) => {
      const types = new Set(ids.map((id) => store.getRaw(id)?.type));
      if (types.has('borderCrossing')) {
        renderAnnotations();
        renderDetected(get(crossings).crossings);
      }
      if (index && (types.has('segment') || types.has('stage') || types.has('group') || types.has('route'))) {
        clearTimeout(timer);
        timer = setTimeout(() => void compute(), RECOMPUTE_MS);
      }
    });
    renderAnnotations();
    if (settings.get('auto', false)) void compute();

    const nearest = (c: Crossing, posts: BorderPost[] = []) =>
      store
        .list('borderCrossing')
        .map((b) => ({ b, d: Math.min(distance(b.lngLat, c.lngLat), ...posts.map((p) => (p.type === 'node' && p.id === b.osmNodeId ? 0 : distance(b.lngLat, p.lngLat)))) }))
        .filter((x) => x.d <= MATCH_M)
        .sort((a, b) => a.d - b.d)[0]?.b;

    const annotate = (c: Crossing, post: BorderPost | null, status: CrossingStatus = 'unknown') => {
      const id = newId();
      commands.run({
        label: t('cmd.addCrossing'),
        changes: [
          edits.create<BorderCrossing>({
            id,
            type: 'borderCrossing',
            tripId: ctx.tripId,
            lngLat: post?.lngLat ?? c.lngLat,
            name: post?.name || `${c.from.name} → ${c.to.name}`,
            status,
            notes: '',
            ...(post?.type === 'node' ? { osmNodeId: post.id } : {}),
          }),
        ],
      });
      selection.set([id]);
    };

    const openCrossing = (c: Crossing) => {
      selection.clear();
      ui.showPlace(CrossingCard, { ctx, crossing: c, annotate, annotationFor: (x: Crossing, near: BorderPost[]) => nearest(x, near)?.id ?? null });
      if (!map.getBounds().contains(c.lngLat)) map.flyTo({ center: c.lngLat, zoom: Math.max(map.getZoom(), 9) });
    };

    const onDetected = (e: MapLayerMouseEvent) => {
      if (get(ui.tool) || ui.claimed(e.originalEvent)) return;
      const i = e.features?.[0]?.properties.i as number | undefined;
      const c = i === undefined ? undefined : get(crossings).crossings[i];
      if (!c) return;
      ui.claim(e.originalEvent);
      openCrossing(c);
    };
    const onAnnotation = (e: MapLayerMouseEvent) => {
      if (get(ui.tool)) return;
      const id = e.features?.[0]?.properties.id as string | undefined;
      if (!id) return;
      ui.claim(e.originalEvent);
      selection.set([id]);
    };
    // Annotations first: they sit on top of the detected points.
    map.on('click', 'border-crossings', onAnnotation);
    map.on('click', 'border-detected', onDetected);
    removers.push(() => {
      map.off('click', 'border-crossings', onAnnotation);
      map.off('click', 'border-detected', onDetected);
    });

    removers.push(
      ui.addCardRenderer('borderCrossing', { component: BorderCard, props: { ctx } }),
      ui.addPanelSection({
        id: 'borders',
        title: t('border.title'),
        component: BordersSection,
        props: { ctx, crossings, compute: () => void compute(), open: openCrossing, annotationNear: (c: Crossing) => nearest(c) },
        order: 17,
      }),
    );

    return () => {
      clearTimeout(timer);
      offStore();
      removers.forEach((off) => off());
    };
  },
});
