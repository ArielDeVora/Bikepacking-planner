import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl';
import { derived, get, writable } from 'svelte/store';
import { OSM_CATEGORIES, poiCategoryFromOmt } from '../../config/pois';
import { defineModule } from '../../core/module';
import { addRoundIcon } from '../../lib/map-icons';
import { osmFromTileId } from '../../lib/places/details';
import PlaceCard from '../../lib/places/PlaceCard.svelte';
import { segmentsOf } from '../../lib/tree';
import { segmentCoords } from '../../model/segment';
import { OverpassLoader } from './loader';
import OsmStatus from './OsmStatus.svelte';
import { tilesAlongLine, tilesInBounds, type OsmPlace, type Tile } from './overpass';
import StageOsm from './StageOsm.svelte';

const SOURCE = 'osm-places';
/** Below this zoom the viewport isn't loaded (too many tiles); places already loaded still show. */
const MIN_ZOOM = 12;
const MOVE_DEBOUNCE_MS = 600;
/** Places drawn by the OpenFreeMap style itself (shops, restaurants, sights… from zoom 15). */
const BASE_POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20', 'poi_transit'];
const human = (s: string) => s.replace(/_/g, ' ');

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
      return layers.registerOverlay({ id, label: t(`osm.cat.${cat.id}` as 'osm.cat.water'), layerIds: [id], visible: false, order: 50 + i, group: 'osm' });
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
      const coords = segmentsOf(store, stageId)
        .filter((s) => s.mode !== 'plane' && s.mode !== 'boat')
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
      ui.claim(e.originalEvent);
      const cat = OSM_CATEGORIES.find((c) => c.id === place.category)!;
      ctx.selection.clear();
      ui.showPlace(PlaceCard, {
        ctx,
        place: { name: place.tags.name ?? '', kind: kind(place.tags), lngLat: place.lngLat, category: cat.poi, osm: { type: place.type, id: place.id, tags: place.tags } },
      });
    };
    const pointer = () => (map.getCanvas().style.cursor = get(ui.tool) ? map.getCanvas().style.cursor : 'pointer');
    const unpointer = () => (map.getCanvas().style.cursor = get(ui.tool) ? map.getCanvas().style.cursor : '');
    const removePointLayers = layerIds.map((id) => ui.addPointLayer(id));
    for (const id of layerIds) {
      map.on('click', id, onClick);
      map.on('mouseenter', id, pointer);
      map.on('mouseleave', id, unpointer);
    }

    // Clicking a place of the base map shows its card, like an OSM overlay feature.
    const baseLayers = () => BASE_POI_LAYERS.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    const onBaseClick = (e: MapMouseEvent) => {
      // Something else (a segment, one of our places) already took this click.
      if (get(ui.tool) || ui.claimed(e.originalEvent)) return;
      const box: [[number, number], [number, number]] = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ];
      if (map.queryRenderedFeatures(box, { layers: layerIds }).length) return;
      const f = map.queryRenderedFeatures(box, { layers: baseLayers() })[0];
      if (!f || f.geometry.type !== 'Point') return;
      ui.claim(e.originalEvent);
      const p = f.properties as Record<string, string>;
      const ref = osmFromTileId(f.id);
      const name = p.name_en || p['name:latin'] || p.name || '';
      ui.showPlace(PlaceCard, {
        ctx,
        place: {
          name,
          kind: human(p.subclass || p.class || ''),
          lngLat: f.geometry.coordinates as [number, number],
          category: poiCategoryFromOmt(p.class ?? '', p.subclass ?? ''),
          osm: ref ? { ...ref, tags: p.name ? { name: p.name } : {} } : undefined,
        },
      });
    };
    let pointing = false;
    const onBaseHover = (e: MapMouseEvent) => {
      if (get(ui.tool)) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: baseLayers() }).length > 0;
      if (hit === pointing) return;
      pointing = hit;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    };
    map.on('click', onBaseClick);
    map.on('mousemove', onBaseHover);

    const removeWidget = ui.addWidget({ id: 'osm.status', component: OsmStatus, props: { t, status }, order: 20 });
    const removeStage = ui.addCardSection({ id: 'osm.stage', component: StageOsm, props: { ctx, loadAlong }, types: ['route', 'stage', 'group'], order: 6 });

    return () => {
      clearTimeout(timer);
      map.off('moveend', loadView);
      map.off('zoomend', onZoom);
      map.off('click', onBaseClick);
      map.off('mousemove', onBaseHover);
      offVisible();
      removeOverlays.forEach((off) => off());
      removePointLayers.forEach((off) => off());
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
