import { writable } from 'svelte/store';
import { defineModule } from '../../core/module';
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
    const styleLayerIds = all
      .slice(0, firstSlot < 0 ? all.length : firstSlot)
      .filter((l) => l.layout?.visibility !== 'none')
      .map((l) => l.id);

    const current = writable<string>(settings.get('base', 'openfreemap'));

    function select(id: string) {
      const base = BASE_MAPS.find((b) => b.id === id) ?? BASE_MAPS[0]!;
      layers.setLayersVisible(styleLayerIds, base.kind === 'style');
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
      applyOpacity: (m, opacity) => m.setPaintProperty('hillshade', 'hillshade-exaggeration', opacity),
    });

    select(settings.get('base', 'openfreemap'));

    return ctx.ui.addPanelSection({
      id: 'map-layers',
      title: t('layers.title'),
      component: LayersSection,
      props: { bases: BASE_MAPS, current, select, layers, t },
      order: 90,
    });
  },
});
