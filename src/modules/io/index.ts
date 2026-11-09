import type { GeoJSONSource } from 'maplibre-gl';
import { defineModule } from '../../core/module';
import { makeBackup, restoreBackup } from './backup';
import DropHint from './DropHint.svelte';
import ExportLink from './ExportLink.svelte';
import { groupGpx, segmentGpx, stageGpx, tripGpx } from './export';
import { download, safeFileName } from './gpx';
import ImportDialog from './ImportDialog.svelte';
import IoSection from './IoSection.svelte';
import { icons } from '../../lib/icons';
import { ACCEPTED, parseFile, type ParsedFile } from './parse';

const PREVIEW = 'import-preview';
const GPX_MIME = 'application/gpx+xml';

export default defineModule({
  id: 'io',
  setup(ctx) {
    const { ui, store, t, layers, map } = ctx;

    layers.addSource(PREVIEW, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: PREVIEW,
        type: 'line',
        source: PREVIEW,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#7048e8', 'line-width': 3, 'line-dasharray': [2, 1.5] },
      },
      'top',
    );
    layers.addLayer(
      {
        id: `${PREVIEW}-points`,
        type: 'circle',
        source: PREVIEW,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#7048e8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      },
      'top',
    );

    const preview = (files: ParsedFile[] | null) => {
      const features: GeoJSON.Feature[] = [];
      for (const f of files ?? []) {
        for (const tr of f.tracks) {
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiLineString', coordinates: tr.parts.map((p) => p.map((c) => [c[0], c[1]])) },
          });
        }
        for (const w of f.waypoints) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: w.lngLat } });
      }
      (map.getSource(PREVIEW) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };

    async function openFiles(list: File[]): Promise<void> {
      if (!list.length) return;
      const parsed = await Promise.all(list.map(async (f) => parseFile(f.name, await f.text())));
      const backup = parsed.find((p) => p.backup)?.backup;
      if (backup) {
        if (window.confirm(t('io.restoreConfirm', { name: backup.tripName || t('trip.defaultName') }))) {
          await ctx.trips.add(restoreBackup(backup)).catch((err) => ui.notify(String(err), 'error'));
        }
        return;
      }
      ui.openDialog(ImportDialog, { ctx, files: parsed, preview });
    }

    // Always reachable from the toolbar, not only from the side panel.
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = ACCEPTED;
    picker.onchange = () => {
      void openFiles([...(picker.files ?? [])]);
      picker.value = '';
    };
    const pick = () => picker.click();
    const removeTool = ui.addTool({ id: 'io.import', label: t('io.importFiles'), icon: icons.upload, shortcut: 'i', order: 60, run: pick });
    const removeShortcut = ctx.shortcuts.add({ keys: 'i', label: t('io.importFiles'), run: pick });

    const save = ({ name, xml }: { name: string; xml: string }) => download(safeFileName(name, 'gpx'), xml, GPX_MIME);

    const removeSection = ui.addPanelSection({
      id: 'io',
      title: t('io.title'),
      component: IoSection,
      props: {
        ctx,
        openFiles,
        exportTrip: (activeOnly: boolean) => save(tripGpx(store, ctx.tripId, activeOnly)),
        exportBackup: () => {
          const backup = makeBackup(store.all().filter((e) => e.tripId === ctx.tripId));
          download(safeFileName(`${backup.tripName} backup ${backup.exportedAt.slice(0, 10)}`, 'json'), JSON.stringify(backup), 'application/json');
        },
      },
      order: 85,
    });
    const removeStageExport = ui.addCardSection({
      id: 'io.stage',
      component: ExportLink,
      props: { ctx, exportGpx: (id: string) => save(stageGpx(store, id)) },
      types: ['stage'],
      order: 5,
    });
    const removeGroupExport = ui.addCardSection({
      id: 'io.group',
      component: ExportLink,
      props: { ctx, exportGpx: (id: string) => save(groupGpx(store, id)) },
      types: ['group'],
      order: 5,
    });
    const removeSegmentExport = ui.addCardSection({
      id: 'io.segment',
      component: ExportLink,
      props: { ctx, exportGpx: (id: string) => save(segmentGpx(store, id)) },
      types: ['segment'],
      order: 5,
    });

    // Drag and drop files anywhere on the page.
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (depth++ === 0) ui.openDialog(DropHint, { t });
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) {
        depth = 0;
        ui.closeDialog(DropHint);
      }
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      ui.closeDialog(DropHint);
      void openFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);

    return () => {
      removeTool();
      removeShortcut();
      removeSection();
      removeStageExport();
      removeGroupExport();
      removeSegmentExport();
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  },
});
