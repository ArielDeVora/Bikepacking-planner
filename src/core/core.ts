import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { writable, type Readable } from 'svelte/store';
import { newId } from '../model/ids';
import { keyBetween } from '../model/order';
import type { Entity, Stage, Trip } from '../model/types';
import { EventBus, type Events } from './bus';
import { CommandStack } from './commands';
import { t } from './i18n';
import { LayerManager } from './layers';
import type { ModuleContext, ModuleLoader } from './module';
import { listTrips, loadTripEntities, openDb, putEntities } from './persistence/idb';
import { attachDebouncedSave } from './persistence/local';
import { Selection } from './selection';
import { createSettings } from './settings';
import { ShortcutManager } from './shortcuts';
import { TripStore } from './store';
import { createTheme } from './theme';
import { UiRegistry } from './ui';

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type CoreStatus = 'loading' | 'ready' | 'error';

interface MapView {
  center: [number, number];
  zoom: number;
}

export function createCore(container: HTMLElement) {
  const settings = createSettings('core');
  const mapSettings = createSettings('map');

  let userId = settings.get<string | null>('userId', null);
  if (!userId) {
    userId = newId();
    settings.set('userId', userId);
  }
  const user = { id: userId };

  setWorkerUrl(maplibreWorkerUrl);
  const view = mapSettings.get<MapView>('view', { center: [60, 42], zoom: 2.5 });
  const map = new MapLibreMap({
    container,
    style: BASE_STYLE_URL,
    center: view.center,
    zoom: view.zoom,
    attributionControl: { compact: true },
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.on('moveend', () => {
    const c = map.getCenter();
    mapSettings.set('view', { center: [c.lng, c.lat], zoom: map.getZoom() } satisfies MapView);
  });

  const bus = new EventBus<Events>();
  const store = new TripStore();
  const commands = new CommandStack(store, () => user.id);
  const selection = new Selection(bus);
  const layers = new LayerManager(map, createSettings('layers'));
  const ui = new UiRegistry();
  const shortcuts = new ShortcutManager();
  const theme = createTheme(settings);
  const status = writable<CoreStatus>('loading');
  let tripId = '';

  window.addEventListener('keydown', shortcuts.handle);
  shortcuts.add({ keys: 'mod+z', label: t('toolbar.undo'), run: () => commands.undo() });
  shortcuts.add({ keys: 'mod+shift+z', label: t('toolbar.redo'), run: () => commands.redo() });
  shortcuts.add({ keys: 'mod+y', label: t('toolbar.redo'), run: () => commands.redo() });
  shortcuts.add({ keys: 'escape', label: 'Clear selection', run: () => selection.clear() });

  store.onChange(({ ids }) => {
    const sel = selection.current;
    if (ids.some((id) => sel.includes(id))) selection.set(sel.filter((id) => store.get(id)));
  });

  const stamp = <E extends Entity>(e: Omit<E, 'updatedAt' | 'updatedBy' | 'deleted'>): E =>
    ({ ...e, updatedAt: Date.now(), updatedBy: user.id, deleted: false }) as unknown as E;

  function newTripEntities(): Entity[] {
    const id = newId();
    return [
      stamp<Trip>({ id, type: 'trip', tripId: id, name: t('trip.defaultName'), ownerId: user.id }),
      stamp<Stage>({
        id: newId(),
        type: 'stage',
        tripId: id,
        order: keyBetween(null, null),
        name: t('tree.stageName', { n: 1 }),
        notes: '',
      }),
    ];
  }

  async function loadLocalTrip(): Promise<void> {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
    } catch (err) {
      console.warn(err);
      ui.notify(t('app.storageUnavailable'), 'warn', 0);
    }

    let entities: Entity[] = [];
    if (db) {
      const wanted = settings.get<string | null>('tripId', null);
      const trips = await listTrips(db);
      const trip = trips.find((tr) => tr.id === wanted) ?? trips[0];
      if (trip) entities = await loadTripEntities(db, trip.id);
    }

    const fresh = entities.length === 0;
    if (fresh) entities = newTripEntities();
    tripId = entities.find((e) => e.type === 'trip')!.id;
    settings.set('tripId', tripId);

    store.apply(entities, fresh ? 'local' : 'load');
    if (db) {
      const target = db;
      const saver = attachDebouncedSave(store, { write: (list) => putEntities(target, list) }, (err) => {
        console.error(err);
        ui.notify(t('app.storageUnavailable'), 'error');
      });
      if (fresh) await putEntities(db, entities);
      window.addEventListener('pagehide', () => void saver.flush());
    }
    bus.emit('trip:loaded', { tripId });
  }

  async function start(modules: ModuleLoader[]): Promise<void> {
    try {
      const mapReady = map.isStyleLoaded()
        ? Promise.resolve()
        : new Promise<void>((r) => map.once('style.load', () => r()));
      const loadedModules = Promise.all(modules.map((load) => load()));
      await Promise.all([mapReady, loadLocalTrip()]);
      layers.installSlots();

      for (const { default: mod } of await loadedModules) {
        const ctx: ModuleContext = {
          map,
          store,
          commands,
          selection,
          bus,
          layers,
          ui,
          shortcuts,
          user,
          t,
          settings: createSettings(mod.id),
          get tripId() {
            return tripId;
          },
        };
        try {
          await mod.setup(ctx);
        } catch (err) {
          console.error(`Module "${mod.id}" failed to start`, err);
          ui.notify(`Module "${mod.id}" failed to start.`, 'error');
        }
      }
      status.set('ready');
    } catch (err) {
      console.error(err);
      status.set('error');
      ui.notify(t('app.loadFailed'), 'error', 0);
    }
  }

  return {
    map,
    store,
    commands,
    selection,
    bus,
    layers,
    ui,
    shortcuts,
    theme,
    user,
    t,
    status: { subscribe: status.subscribe } as Readable<CoreStatus>,
    get tripId() {
      return tripId;
    },
    start,
  };
}

export type Core = ReturnType<typeof createCore>;
