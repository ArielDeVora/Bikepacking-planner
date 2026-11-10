import { KEYS } from '../../config/shortcuts';
import type { GeoJSONSource } from 'maplibre-gl';
import { get } from 'svelte/store';
import { defineModule } from '../../core/module';
import PlaceCard from '../../lib/places/PlaceCard.svelte';
import type { LngLat } from '../../model/types';
import { Photon, type SearchResult } from '../../lib/photon';
import SearchBox from './SearchBox.svelte';

const MARKER = 'search-marker';

export default defineModule({
  id: 'search',
  setup(ctx) {
    const { map, layers, ui, shortcuts, t, selection } = ctx;
    const photon = new Photon();

    layers.addSource(MARKER, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: MARKER,
        type: 'circle',
        source: MARKER,
        paint: { 'circle-radius': 8, 'circle-color': '#e03131', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      },
      'top',
    );
    const mark = (p: LngLat | null) =>
      (map.getSource(MARKER) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }] : [],
      });

    // The marker stays while the card for this result is open.
    let shown: unknown = null;
    const offPlace = ui.place.subscribe((p) => {
      if (p !== shown) mark(null);
    });

    const show = (place: Parameters<typeof PlaceCard>[1]['place']) => {
      selection.clear();
      ui.showPlace(PlaceCard, { ctx, place });
      shown = get(ui.place);
      mark(place.lngLat);
    };

    const choose = (r: SearchResult) => {
      if (r.bbox && r.bbox[2] - r.bbox[0] > 0.02) map.fitBounds(r.bbox, { padding: 60, maxZoom: 14 });
      else map.flyTo({ center: r.lngLat, zoom: Math.max(map.getZoom(), 15) });
      show({ name: r.name, kind: [r.kind, r.detail].filter(Boolean).join(' · '), lngLat: r.lngLat, category: r.category, osm: r.osm });
    };
    const goTo = (p: LngLat) => {
      map.flyTo({ center: p, zoom: Math.max(map.getZoom(), 14) });
      show({ name: '', kind: t('search.coordinates'), lngLat: p, category: 'other' });
    };

    let focus = () => {};
    const removeWidget = ui.addWidget({
      id: 'search',
      component: SearchBox,
      props: { ctx, photon, choose, goTo, register: (f: () => void) => (focus = f) },
      position: 'top',
    });
    const removeShortcut = shortcuts.add({ keys: KEYS.search, label: t('help.search'), run: () => focus() });

    return () => {
      offPlace();
      removeWidget();
      removeShortcut();
    };
  },
});
