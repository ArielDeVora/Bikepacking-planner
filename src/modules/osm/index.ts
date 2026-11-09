import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { derived, get, writable } from 'svelte/store';
import { OSM_CATEGORIES } from '../../config/pois';
import { defineModule } from '../../core/module';
import { addRoundIcon } from '../../lib/map-icons';
import PlaceCard from '../../lib/places/PlaceCard.svelte';
import { segmentCoords } from '../../model/segment';
import { OverpassLoader } from './loader';
import OsmStatus from './OsmStatus.svelte';
import { tilesAlongLine, tilesInBounds, type OsmPlace, type Tile } from './overpass';
import StageOsm from './StageOsm.svelte';

const SOURCE = 'osm-places';
/** Below this zoom the viewport isn't loaded (too many tiles); places already loaded still show. */
const MIN_ZOOM = 12;
const MOVE_DEBOUNCE_MS = 600;

const kind = (tags: Record<string, string>) =>
  (tags.shop ?? tags.amenity ?? tags.tourism ?? tags.man_made ?? '').replace(/_/g, ' ');

export default defineModule({
  id: 'osm',
  setup(ctx) {
    const { map, layers, ui, store, t } = ctx;

    layers.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: 'POIs: <a href="https://overpass-api.de/" target="_blank">Overpass API</a>',
    });
    const layerIds: string[] = [];
    const removeOverlays = OSM_CATEGORIES.map((cat, i) => {
      addRoundIcon(map, `osm-${cat.id}`, cat.icon, cat.color, 20, false);
      const id = `osm-${cat.id}`;
      layerIds.push(id);
      layers.addLayer(
        {
          id,
          type: 'symbol',
          source: SOURCE,
          filter: ['==', ['get', 'category'], cat.id],
          layout: { 'icon-image': id, 'icon-allow-overlap': false, 'icon-padding': 1 },
        },
        'overlay',
      );
      return layers.registerOverlay({ id, label: t(`osm.cat.${cat.id}` as 'osm.cat.water'), layerIds: [id], visible: false, order: 50 + i });
    });

    const visible = derived(layers.overlays, (list) =>
      OSM_CATEGORIES.filter((c) => list.find((o) => o.spec.id === `osm-${c.id}`)?.visible).map((c) => c.id),
    );

    const byKey = new Map<string, OsmPlace>();
    const render = () => {
      const cats = new Set(get(visible));
      const features: GeoJSON.Feature[] = loader.places(cats).map((p) => {
        byKey.set(p.key, p);
        return { type: 'Feature', properties: { key: p.key, category: p.category }, geometry: { type: 'Point', coordinates: p.lngLat } };
      });
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    const loader = new OverpassLoader(OSM_CATEGORIES, render);

    const zoom = writable(map.getZoom());
    const onZoom = () => zoom.set(map.getZoom());
    map.on('zoomend', onZoom);
    const status = derived([visible, loader.state, zoom], ([cats, s, z]) => {
      if (!cats.length) return 'hidden' as const;
      if (s.error === 'busy' || s.busyUntil > Date.now()) return 'busy' as const;
      if (s.queued) return 'loading' as const;
      return z < MIN_ZOOM ? ('zoom' as const) : ('ready' as const);
    });

    // Tiles prefetched along a stage stay queued even when the map moves on.
    const along = new Set<Tile>();

    // Load the viewport when the map stops moving.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadView = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cats = get(visible);
        if (!cats.length) return;
        if (map.getZoom() < MIN_ZOOM) return;
        const b = map.getBounds();
        const tiles = tilesInBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        loader.keepOnly(new Set([...tiles, ...along]));
        void loader.ensure(tiles, cats);
      }, MOVE_DEBOUNCE_MS);
    };
    map.on('moveend', loadView);
    const offVisible = visible.subscribe(() => {
      render();
      loadView();
    });

    const loadAlong = async (stageId: string): Promise<number> => {
      const cats = get(visible);
      if (!cats.length) return -1;
      const coords = store
        .list('segment', (s) => s.stageId === stageId && s.mode !== 'plane' && s.mode !== 'boat')
        .flatMap((s) => segmentCoords(s));
      const tiles = tilesAlongLine(coords);
      for (const tile of tiles) along.add(tile);
      await loader.ensure(tiles, cats);
      return tiles.length;
    };

    const onClick = (e: MapLayerMouseEvent) => {
      if (get(ui.tool)) return;
      const place = byKey.get(e.features?.[0]?.properties.key as string);
      if (!place) return;
      const cat = OSM_CATEGORIES.find((c) => c.id === place.category)!;
      ctx.selection.clear();
      ui.showPlace(PlaceCard, {
        ctx,
        place: { name: place.tags.name ?? '', kind: kind(place.tags), lngLat: place.lngLat, category: cat.poi, osm: { type: place.type, id: place.id, tags: place.tags } },
      });
    };
    const pointer = () => (map.getCanvas().style.cursor = get(ui.tool) ? map.getCanvas().style.cursor : 'pointer');
    const unpointer = () => (map.getCanvas().style.cursor = get(ui.tool) ? map.getCanvas().style.cursor : '');
    for (const id of layerIds) {
      map.on('click', id, onClick);
      map.on('mouseenter', id, pointer);
      map.on('mouseleave', id, unpointer);
    }

    const removeWidget = ui.addWidget({ id: 'osm.status', component: OsmStatus, props: { t, status }, order: 20 });
    const removeStage = ui.addCardSection({ id: 'osm.stage', component: StageOsm, props: { ctx, loadAlong }, types: ['stage'], order: 6 });

    return () => {
      clearTimeout(timer);
      map.off('moveend', loadView);
      map.off('zoomend', onZoom);
      offVisible();
      removeOverlays.forEach((off) => off());
      removeWidget();
      removeStage();
      for (const id of layerIds) {
        map.off('click', id, onClick);
        map.off('mouseenter', id, pointer);
        map.off('mouseleave', id, unpointer);
      }
    };
  },
});
