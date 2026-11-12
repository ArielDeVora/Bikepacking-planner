import type { ImageSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import { defineModule } from '../../core/module';
import { blendFor, PRECIPITATION, TEMPERATURE, weekDay, WEEKS, type ClimateVar } from './codec';
import ClimateBar from './ClimateBar.svelte';
import ClimatePoint from './ClimatePoint.svelte';
import { ClimateCanvas, loadMonth, MAX_LAT } from './data';
import ExpectedClimate from './ExpectedClimate.svelte';
import { createClimateState, type Shown } from './state';

const OVERLAYS = { temp: 'climate-temp', rain: 'climate-rain' } as const;
const ATTRIBUTION = 'Climate: <a href="https://www.climatologylab.org/terraclimate.html">TerraClimate</a> 1991–2020';
const PLAY_MS = 450;
const CREDIT = 'climate-credit';
const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MAX_LAT],
  [180, MAX_LAT],
  [180, -MAX_LAT],
  [-180, -MAX_LAT],
];

/** Under the base map's labels and the country borders, so both stay readable over the colours. */
function belowLabels(map: MapLibreMap): string {
  const layers = map.getStyle().layers ?? [];
  return layers.find((l) => l.type === 'symbol' || l.id.startsWith('borders-'))?.id ?? 'slot:overlay';
}

export default defineModule({
  id: 'climate',
  setup(ctx) {
    const { map, layers, ui, t } = ctx;
    const state = createClimateState();
    const canvases = { temp: new ClimateCanvas(), rain: new ClimateCanvas() };
    const below = () => belowLabels(map);

    for (const kind of ['temp', 'rain'] as const) {
      const id = OVERLAYS[kind];
      if (!map.getSource(id)) {
        map.addSource(id, { type: 'image', url: EMPTY_PNG, coordinates: CORNERS });
      }
      if (!map.getLayer(id)) {
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.65, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, below());
      }
    }
    // A new base style (theme change) puts its labels back under the overlays: move them below.
    const offBase = ctx.bus.on('map:baseStyle', () => {
      for (const kind of ['temp', 'rain'] as const) if (map.getLayer(OVERLAYS[kind])) map.moveLayer(OVERLAYS[kind], below());
    });
    // Image sources can't carry an attribution: an empty source shown with the overlays does.
    layers.addSource(CREDIT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: ATTRIBUTION });
    for (const kind of ['temp', 'rain'] as const) layers.addLayer({ id: `${OVERLAYS[kind]}-credit`, type: 'line', source: CREDIT }, 'overlay');
    const removers = [
      layers.registerOverlay({
        id: OVERLAYS.temp,
        label: t('climate.tempOverlay'),
        layerIds: [OVERLAYS.temp, `${OVERLAYS.temp}-credit`],
        visible: false,
        opacity: 0.65,
        order: 35,
        group: 'conditions',
      }),
      layers.registerOverlay({
        id: OVERLAYS.rain,
        label: t('climate.rainOverlay'),
        layerIds: [OVERLAYS.rain, `${OVERLAYS.rain}-credit`],
        visible: false,
        opacity: 0.65,
        order: 36,
        group: 'conditions',
      }),
    ];

    // One climate overlay at a time: switching one on switches the other off.
    let shown: Shown = null;
    removers.push(
      layers.overlays.subscribe((list) => {
        const on = (kind: 'temp' | 'rain') => !!list.find((o) => o.spec.id === OVERLAYS[kind])?.visible;
        let next: Shown = on('temp') ? 'temp' : on('rain') ? 'rain' : null;
        if (on('temp') && on('rain')) {
          next = shown === 'temp' ? 'rain' : 'temp';
          queueMicrotask(() => layers.setOverlay(OVERLAYS[next === 'temp' ? 'rain' : 'temp'], { visible: false }));
        }
        if (next !== shown) {
          shown = next;
          state.update((s) => ({ ...s, shown: next, playing: next ? s.playing : false }));
        }
      }),
    );

    // Redraw when the overlay, the variable or the week changes.
    let token = 0;
    let failed = false;
    let lastUrl = '';
    const redraw = async () => {
      const s = get(state);
      if (!s.shown) return;
      const run = ++token;
      const variable: ClimateVar = s.shown === 'rain' ? 'ppt' : s.temp;
      const { a, b, w } = blendFor(weekDay(s.week));
      try {
        const [ga, gb] = await Promise.all([loadMonth(variable, a), loadMonth(variable, b)]);
        if (run !== token) return;
        const canvas = canvases[s.shown];
        canvas.draw(variable, s.shown === 'rain' ? PRECIPITATION : TEMPERATURE, ga, gb, w);
        const url = await canvas.toUrl();
        if (run !== token) return URL.revokeObjectURL(url);
        (map.getSource(OVERLAYS[s.shown]) as ImageSource | undefined)?.updateImage({ url, coordinates: CORNERS });
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = url;
        failed = false;
      } catch (err) {
        console.warn(err);
        if (!failed) ui.notify(t('climate.loadFailed'), 'error');
        failed = true;
      }
    };
    let last = '';
    removers.push(
      state.subscribe((s) => {
        const key = `${s.shown}:${s.temp}:${s.week}`;
        if (key !== last) {
          last = key;
          void redraw();
        }
      }),
    );

    // Play: one week after another, round the year.
    let timer = 0;
    removers.push(
      state.subscribe((s) => {
        if (s.playing && !timer) timer = window.setInterval(() => state.update((x) => ({ ...x, week: (x.week + 1) % WEEKS })), PLAY_MS);
        if (!s.playing && timer) {
          clearInterval(timer);
          timer = 0;
        }
      }),
    );

    // With a climate overlay on, clicking an empty spot shows that place's year.
    const onClick = (e: MapMouseEvent) => {
      if (!get(state).shown || get(ui.tool) || ui.claimed(e.originalEvent)) return;
      ui.claim(e.originalEvent);
      ctx.selection.clear();
      ui.showPlace(ClimatePoint, { ctx, climate: state, lngLat: [e.lngLat.lng, e.lngLat.lat] });
    };
    map.on('click', onClick);

    removers.push(
      ui.addWidget({ id: 'climate.bar', component: ClimateBar, props: { ctx, climate: state }, position: 'top', order: 20 }),
      ui.addCardSection({ id: 'climate.expected', component: ExpectedClimate, props: { ctx, climate: state }, types: ['stage', 'group', 'segment'], order: 4 }),
    );

    return () => {
      clearInterval(timer);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      map.off('click', onClick);
      removers.forEach((off) => off());
      offBase();
    };
  },
});
