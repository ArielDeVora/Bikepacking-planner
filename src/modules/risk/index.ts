import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { get, writable } from 'svelte/store';
import { defineModule } from '../../core/module';
import { loadCountries, type CountryIndex } from '../../lib/countries';
import { distance } from '../../lib/geo/geo';
import { tripSegments } from '../../lib/tree';
import { segmentCoords } from '../../model/segment';
import { usAdvisories, type TripCountries } from './advisories';
import CountryAdvice from './CountryAdvice.svelte';
import TravelAdvice from './TravelAdvice.svelte';

const SOURCE = 'risk-countries';
const LEVEL_COLORS = ['#40c057', '#fab005', '#fd7e14', '#e03131'];
const SAMPLE_M = 5000;

/** Countries the trip passes through, in the order it reaches them. */
export function countriesAlong(index: CountryIndex, lines: (readonly (readonly number[])[])[]): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const line of lines) {
    let since = Infinity;
    for (let i = 0; i < line.length; i++) {
      if (i > 0) since += distance(line[i - 1] as [number, number], line[i] as [number, number]);
      if (since < SAMPLE_M && i < line.length - 1) continue;
      since = 0;
      const c = index.at(line[i]!);
      if (c && !seen.has(c.code)) seen.set(c.code, c.name);
    }
  }
  return [...seen].map(([code, name]) => ({ code, name }));
}

export default defineModule({
  id: 'risk',
  setup(ctx) {
    const { map, layers, ui, store, t } = ctx;

    // Countries coloured by US advisory level (1 green … 4 red), loaded when first shown.
    layers.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: 'Advisory levels: U.S. Department of State · Outlines: Natural Earth',
    });
    layers.addLayer(
      {
        id: 'risk-levels',
        type: 'fill',
        source: SOURCE,
        paint: {
          'fill-color': ['match', ['get', 'level'], 1, LEVEL_COLORS[0]!, 2, LEVEL_COLORS[1]!, 3, LEVEL_COLORS[2]!, 4, LEVEL_COLORS[3]!, '#adb5bd'],
          'fill-opacity': 0.28,
        },
      },
      'overlay',
    );
    const removeOverlay = layers.registerOverlay({ id: 'risk-levels', label: t('risk.overlay'), layerIds: ['risk-levels'], visible: false, order: 30 });

    let filled = false;
    const fill = async () => {
      if (filled) return;
      filled = true;
      try {
        const [index, us] = await Promise.all([loadCountries(), usAdvisories()]);
        const features: GeoJSON.Feature[] = index.countries.map((c) => ({
          type: 'Feature',
          properties: { code: c.code, name: c.name, level: us?.lookup(c.name)?.level ?? 0 },
          geometry: { type: 'MultiPolygon', coordinates: c.polygons.map((p) => p.rings) },
        }));
        (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
        if (!us) ui.notify(t('risk.usUnavailable'), 'warn');
      } catch {
        filled = false;
        ui.notify(t('border.error'), 'error');
      }
    };
    const offOverlays = layers.overlays.subscribe((list) => {
      if (list.find((o) => o.spec.id === 'risk-levels')?.visible) void fill();
    });

    const open = (country: { code: string; name: string }) => {
      ctx.selection.clear();
      ui.showPlace(CountryAdvice, { ctx, country });
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (get(ui.tool) || ui.claimed(e.originalEvent)) return;
      const p = e.features?.[0]?.properties as { code?: string; name?: string } | undefined;
      if (!p?.code || !p.name) return;
      ui.claim(e.originalEvent);
      open({ code: p.code, name: p.name });
    };
    map.on('click', 'risk-levels', onClick);

    // The countries on the trip, for the Travel advice section.
    const countries = writable<TripCountries>({ status: 'idle', countries: [] });
    const check = async () => {
      countries.set({ status: 'loading', countries: [] });
      try {
        const index = await loadCountries();
        const lines = tripSegments(store).map((s) => segmentCoords(s));
        countries.set({ status: 'ready', countries: countriesAlong(index, lines) });
      } catch {
        countries.set({ status: 'error', countries: [] });
      }
    };

    const removeSection = ui.addPanelSection({
      id: 'risk',
      title: t('risk.title'),
      component: TravelAdvice,
      props: { ctx, countries, check: () => void check(), open },
      order: 18,
    });

    return () => {
      offOverlays();
      removeOverlay();
      removeSection();
      map.off('click', 'risk-levels', onClick);
    };
  },
});
