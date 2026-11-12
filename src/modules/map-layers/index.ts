import { get, writable } from 'svelte/store';
import { BASE_STYLE_URLS } from '../../config/basemap';
import { defineModule } from '../../core/module';
import type { Theme } from '../../core/theme';
import { swapBaseLayers } from './base-style';
import { TERRAIN_DEM } from '../../config/terrain';
import { BASE_MAPS, type BaseMap } from './bases';
import LayersSection from './LayersSection.svelte';

const rasterLayerId = (base: BaseMap) => `base-${base.id}`;

export default defineModule({
  id: 'map-layers',
  setup(ctx) {
    const { map, layers, settings, t } = ctx;

    // Everything below the first slot marker belongs to the vector base style.
    const all = map.getStyle().layers;
    const firstSlot = all.findIndex((l) => l.id.startsWith('slot:'));
    const initial = all.slice(0, firstSlot < 0 ? all.length : firstSlot);
    let baseIds = initial.map((l) => l.id);
    let styleDefaults = new Map(initial.map((l) => [l.id, l.layout?.visibility]));
    /** Base layers the style shows (some start hidden, and stay so). */
    const shownBase = () => baseIds.filter((id) => map.getLayer(id) && styleDefaults.get(id) !== 'none');

    const current = writable<string>(settings.get('base', 'openfreemap'));

    function select(id: string) {
      const base = BASE_MAPS.find((b) => b.id === id) ?? BASE_MAPS[0]!;
      layers.setLayersVisible(shownBase(), base.kind === 'style');
      for (const b of BASE_MAPS) {
        if (b.kind === 'raster' && b !== base) layers.setLayersVisible([rasterLayerId(b)], false);
      }
      if (base.kind === 'raster') {
        const id = rasterLayerId(base);
        layers.addSource(id, {
          type: 'raster',
          tiles: base.tiles,
          tileSize: 256,
          maxzoom: base.maxzoom,
          attribution: base.attribution,
        });
        layers.addLayer({ id, type: 'raster', source: id }, 'base');
        layers.setLayersVisible([id], true);
      }
      current.set(base.id);
      settings.set('base', base.id);
    }

    layers.addSource('terrain-dem', {
      type: 'raster-dem',
      encoding: 'terrarium',
      tiles: TERRAIN_DEM.tiles,
      tileSize: 256,
      maxzoom: TERRAIN_DEM.maxzoom,
      attribution: TERRAIN_DEM.attribution,
    });
    layers.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain-dem',
        layout: { visibility: 'none' },
        paint: { 'hillshade-shadow-color': '#3d3328', 'hillshade-highlight-color': '#ffffff' },
      },
      'overlay',
    );
    layers.registerOverlay({
      id: 'hillshade',
      label: t('layers.overlay.hillshade'),
      layerIds: ['hillshade'],
      visible: false,
      opacity: 0.4,
      order: 12,
      group: 'map',
      applyOpacity: (m, opacity) => m.setPaintProperty('hillshade', 'hillshade-exaggeration', opacity),
    });

    select(settings.get('base', 'openfreemap'));

    // The vector base map follows the theme: OpenFreeMap's dark style in dark mode.
    let styled: Theme = get(ctx.theme);
    let swapping = Promise.resolve();
    const offTheme = ctx.theme.subscribe((next) => {
      if (next === styled) return;
      styled = next;
      swapping = swapping.then(async () => {
        try {
          const hidden = (BASE_MAPS.find((b) => b.id === get(current))?.kind ?? 'style') !== 'style';
          const swapped = await swapBaseLayers(map, BASE_STYLE_URLS[next], baseIds, hidden);
          baseIds = swapped.ids;
          styleDefaults = swapped.defaults;
          ctx.bus.emit('map:baseStyle', { theme: next });
        } catch (err) {
          console.warn(err);
        }
      });
    });

    const offSection = ctx.ui.addPanelSection({
      id: 'map-layers',
      title: t('layers.title'),
      component: LayersSection,
      props: { bases: BASE_MAPS, current, select, layers, t },
      order: 90,
      placement: 'pane',
    });
    return () => {
      offTheme();
      offSection();
    };
  },
});

declare module '../../core/bus' {
  interface Events {
    /** The base map's own layers were replaced (e.g. for the dark theme). */
    'map:baseStyle': { theme: Theme };
  }
}
