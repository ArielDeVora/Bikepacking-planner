import { KEYS } from '../../config/shortcuts';
import { get, writable } from 'svelte/store';
import { removeChanges } from '../../lib/segment-edits';
import { segmentsOf } from '../../lib/tree';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import type { Segment, TravelMode } from '../../model/types';
import { RouteEditor } from './editor';
import Legend from './Legend.svelte';
import { RouteRenderer } from './render';
import { brouter } from './routing/brouter';
import { defaultProfile, type RoutingError } from './routing/provider';
import { RoutingQueue } from './routing/queue';
import { createReconciler } from './routing/reconcile';
import SegmentCard from './SegmentCard.svelte';

const ERROR_TOAST_GAP_MS = 8000;

export default defineModule({
  id: 'routes',
  setup(ctx) {
    const { map, store, selection, bus, ui, shortcuts, settings, t } = ctx;

    const queue = new RoutingQueue(brouter);
    let lastErrorToast = 0;
    const onError = (err: RoutingError) => {
      if (Date.now() - lastErrorToast < ERROR_TOAST_GAP_MS) return;
      lastErrorToast = Date.now();
      ui.notify(
        err.kind === 'rateLimit' ? t('routes.rateLimited') : t('routes.failed', { reason: t(`routes.error.${err.kind}`) }),
        'warn',
      );
    };
    // Someone else's pending legs are routed here only if they stay pending for a while.
    const STALE_MS = 30_000;
    const recheck = new Map<string, ReturnType<typeof setTimeout>>();
    const shouldRoute = (seg: Segment) => {
      if (ctx.cloud.isMine(seg.updatedBy) || Date.now() - seg.updatedAt > STALE_MS) return true;
      clearTimeout(recheck.get(seg.id));
      recheck.set(
        seg.id,
        setTimeout(() => {
          recheck.delete(seg.id);
          const current = store.get(seg.id, 'segment');
          if (current) reconciler.scan([current]);
        }, STALE_MS),
      );
      return false;
    };
    const reconciler = createReconciler(store, ctx.commands, queue, onError, shouldRoute);

    const renderer = new RouteRenderer(map, ctx.layers, store, ctx.visibility);
    renderer.install();
    const offWidth = ctx.prefs.watch('routeWidth', (w) => renderer.setWidthScale(w));

    const lastMode = {
      get: () => settings.get<TravelMode>('lastMode', 'bike'),
      set: (mode: TravelMode) => settings.set('lastMode', mode),
    };
    // New bike segments use the profile chosen in Settings (stored only when it isn't the default).
    const profileFor = (mode: TravelMode) => {
      const wanted = mode === 'bike' ? ctx.prefs.current.bikeProfile : null;
      const known = wanted && brouter.profiles[mode]?.some((p) => p.id === wanted);
      return known && wanted !== defaultProfile(brouter, mode) ? wanted : undefined;
    };
    const editor = new RouteEditor(ctx, renderer, lastMode.get, profileFor);
    const detach = editor.attach();

    /** Highlights the segments of everything selected (segments, groups, stages). */
    const syncHighlight = () => {
      renderer.setSelected([...new Set(selection.current.flatMap((id) => segmentsOf(store, id).map((s) => s.id)))]);
    };
    const syncSelection = () => {
      const ids = selection.current;
      const seg = ids.length === 1 ? store.get(ids[0]!, 'segment') : undefined;
      renderer.setActive(seg?.id ?? null);
      syncHighlight();
      editor.onSelectionChanged();
    };

    const offStore = store.onChange(({ ids }) => {
      renderer.invalidate(ids);
      if (renderer.activeId && ids.includes(renderer.activeId)) {
        if (!store.get(renderer.activeId, 'segment')) syncSelection();
        else editor.refresh();
      }
      const changed = ids.map((id) => store.get(id, 'segment')).filter((s) => !!s);
      if (changed.length) reconciler.scan(changed);
      if (changed.length && selection.current.length) syncHighlight();
    });
    const offSelection = bus.on('selection:changed', syncSelection);
    const offVisibility = ctx.visibility.hidden.subscribe(() => {
      renderer.invalidateAll();
      editor.refresh();
    });
    renderer.invalidateAll();
    reconciler.scan(store.list('segment'));

    const visibleModes = writable<string[]>([]);
    let idleTimer = 0;
    const onIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const found = new Set<string>();
        for (const f of map.queryRenderedFeatures({ layers: renderer.modeLayerIds })) {
          found.add((f.properties.status as string | undefined) ?? (f.properties.mode as string));
        }
        visibleModes.set([...found]);
      }, 150);
    };
    map.on('idle', onIdle);

    const removeTool = ui.addTool({
      id: 'routes.draw',
      label: t('routes.draw'),
      icon: icons.route,
      shortcut: KEYS.draw,
      order: 10,
      active: editor.drawing,
      run: () => editor.toggleDrawing(),
    });

    // Deletes the selected point, else the selected segments, places, zones and crossings (stages only from the tree).
    const deleteSelection = () => {
      if (editor.deleteSelectedAnchor()) return;
      const ids = selection.current.filter((id) => {
        const type = store.get(id)?.type;
        return type === 'segment' || type === 'group' || type === 'poi' || type === 'zone' || type === 'borderCrossing';
      });
      if (ids.length) ctx.commands.run({ label: t('tree.delete'), changes: removeChanges(store, ids) });
    };
    const offShortcuts = [
      shortcuts.add({ keys: KEYS.draw, label: t('routes.draw'), run: () => editor.toggleDrawing() }),
      shortcuts.add({
        keys: 'escape',
        label: t('help.escape'),
        run: () => {
          if (get(ui.tool)) ui.setTool(null);
          else if (!editor.clearAnchor()) {
            selection.clear();
            ui.closePlace();
          }
        },
      }),
      shortcuts.add({ keys: KEYS.deleteAlt, label: t('help.delete'), run: deleteSelection }),
      shortcuts.add({ keys: KEYS.delete, label: t('help.delete'), run: deleteSelection }),
    ];

    const removeCard = ui.addCardRenderer('segment', {
      component: SegmentCard,
      props: { ctx, provider: brouter, reconciler, onModeChosen: lastMode.set },
    });
    const removeLegend = ui.addWidget({ id: 'routes.legend', component: Legend, props: { t, visibleModes } });

    return () => {
      offWidth();
      detach();
      offStore();
      offSelection();
      offVisibility();
      offShortcuts.forEach((off) => off());
      map.off('idle', onIdle);
      removeTool();
      removeCard();
      removeLegend();
    };
  },
});
