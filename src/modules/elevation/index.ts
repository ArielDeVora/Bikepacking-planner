import type { GeoJSONSource } from 'maplibre-gl';
import { writable } from 'svelte/store';
import { TERRAIN_DEM } from '../../config/terrain';
import { edits } from '../../core/commands';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import type { Segment } from '../../model/types';
import { Dem } from './dem';
import ProfileDrawer from './ProfileDrawer.svelte';
import { applyTerrain, terrainJobs } from './terrain';

const HOVER = 'profile-hover';
/** Someone else's legs are filled in here only if they still lack elevation after this long. */
const STALE_MS = 30_000;

export default defineModule({
  id: 'elevation',
  setup(ctx) {
    const { store, ui, map, layers, settings, shortcuts, t, commands } = ctx;

    // Terrain elevation for legs that have none.
    const dem = new Dem(TERRAIN_DEM.tiles[0]!);
    const running = new Set<string>();
    const failed = new Set<string>();
    const recheck = new Map<string, ReturnType<typeof setTimeout>>();

    function fill(seg: Segment): void {
      if (!ctx.cloud.isMine(seg.updatedBy) && Date.now() - seg.updatedAt < STALE_MS) {
        clearTimeout(recheck.get(seg.id));
        recheck.set(seg.id, setTimeout(() => {
          recheck.delete(seg.id);
          const current = store.get(seg.id, 'segment');
          if (current) fill(current);
        }, STALE_MS));
        return;
      }
      for (const job of terrainJobs(seg)) {
        const key = `${seg.id}:${job.line}`;
        if (running.has(key) || failed.has(job.line)) continue;
        running.add(key);
        void dem.sample(job.points).then((elevations) => {
          running.delete(key);
          const current = store.get(seg.id, 'segment');
          if (!current) return;
          const geometry = applyTerrain(current, job, elevations);
          if (geometry) commands.patch([edits.update<Segment>(store, seg.id, geometry)]);
          else if (!elevations.some(Number.isFinite)) failed.add(job.line);
        });
      }
    }

    const offStore = store.onChange(({ ids }) => {
      for (const id of ids) {
        const seg = store.get(id, 'segment');
        if (seg) fill(seg);
      }
    });
    store.list('segment').forEach(fill);

    // Profile drawer, with a marker on the map for the hovered position.
    layers.addSource(HOVER, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: HOVER,
        type: 'circle',
        source: HOVER,
        paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#212529', 'circle-stroke-width': 2.5 },
      },
      'top',
    );
    const setHover = (pos: [number, number] | null) =>
      (map.getSource(HOVER) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: pos ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pos } }] : [],
      });

    const open = writable(settings.get('open', false));
    const offOpen = open.subscribe((v) => {
      settings.set('open', v);
      if (!v) setHover(null);
    });
    const toggle = () => open.update((v) => !v);

    const removeDrawer = ui.addDrawer({ id: 'elevation', component: ProfileDrawer, props: { ctx, open, setHover } });
    const removeTool = ui.addTool({
      id: 'elevation.profile',
      label: t('elevation.title'),
      icon: icons.mountain,
      shortcut: 'e',
      order: 50,
      active: open,
      run: toggle,
    });
    const removeShortcut = shortcuts.add({ keys: 'e', label: t('elevation.title'), run: toggle });

    return () => {
      offStore();
      offOpen();
      removeDrawer();
      removeTool();
      removeShortcut();
      recheck.forEach(clearTimeout);
    };
  },
});
