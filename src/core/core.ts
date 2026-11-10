import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { writable, type Readable } from 'svelte/store';
import { newId } from '../model/ids';
import { STAGE_COLORS } from '../config/modes';
import { keyBetween } from '../model/order';
import type { Entity, Stage, Trip } from '../model/types';
import { EventBus, type Events } from './bus';
import { createCloud } from './cloud/cloud';
import { CommandStack } from './commands';
import { HistoryLog } from './history/log';
import { HistoryRecorder } from './history/recorder';
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
import { Visibility } from './visibility';

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type CoreStatus = 'loading' | 'ready' | 'error';

interface MapView {
  center: [number, number];
  zoom: number;
}

export function createCore(container: HTMLElement) {
  const settings = createSettings('core');
  const mapSettings = createSettings('map');

  let localUserId = settings.get<string | null>('userId', null);
  /** No trace of an earlier visit in this browser. */
  const firstVisit = !localUserId;
  if (!localUserId) {
    localUserId = newId();
    settings.set('userId', localUserId);
  }
  /** The signed-in account's id, or a per-browser id when signed out. */
  const user = { id: localUserId };

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
  const status = writable<CoreStatus>('loading');
  let tripId = '';
  let flushLocal: () => Promise<void> = async () => {};
  let db: IDBDatabase | null = null;

  const cloudSettings = createSettings('cloud');
  const cloud = createCloud({
    store,
    bus,
    settings: cloudSettings,
    user,
    localUserId,
    tripId: () => tripId,
    openTrip: (id) => void trips.open(id),
  });

  const commands = new CommandStack(store, () => user.id);
  commands.guard = (current) => {
    const foreign = current.filter((e) => e.updatedBy && !cloud.isMine(e.updatedBy));
    if (!foreign.length) return true;
    const names = [...new Set(foreign.map((e) => cloud.profileOf(e.updatedBy)?.name || t('collab.someone')))];
    return window.confirm(t('collab.undoOverwrite', { names: names.join(', ') }));
  };
  // History: every action becomes a commit, kept in this browser and, for shared trips, on the server.
  const historyLog = new HistoryLog(
    () => db,
    () => cloud.history(),
    () => tripId,
  );
  const recorder = new HistoryRecorder(commands, {
    tripId: () => tripId,
    userId: () => user.id,
    label: (kind, label) => (kind === 'undo' ? t('history.undone', { label }) : kind === 'redo' ? t('history.redone', { label }) : label),
    save: (commit) => void historyLog.add(commit),
  });
  cloud.shared.subscribe((on) => {
    if (on) void historyLog.upload();
  });
  window.addEventListener('pagehide', () => recorder.flush());
  window.addEventListener('online', () => void historyLog.upload());
  const history = { log: historyLog, recorder };

  const selection = new Selection(bus);
  const layers = new LayerManager(map, createSettings('layers'));
  const ui = new UiRegistry();
  const shortcuts = new ShortcutManager();
  const theme = createTheme(settings);
  const visibility = new Visibility(settings, () => tripId);

  window.addEventListener('keydown', shortcuts.handle);
  shortcuts.add({ keys: 'mod+z', label: t('toolbar.undo'), run: () => commands.undo() });
  shortcuts.add({ keys: 'mod+shift+z', label: t('toolbar.redo'), run: () => commands.redo() });
  shortcuts.add({ keys: 'mod+y', label: t('toolbar.redo'), run: () => commands.redo() });
  shortcuts.add({ keys: 'escape', label: t('help.escape'), run: () => selection.clear() });

  bus.on('selection:changed', ({ ids }) => {
    if (ids.length) ui.closePlace();
  });

  store.onChange(({ ids }) => {
    const sel = selection.current;
    if (ids.some((id) => sel.includes(id))) selection.set(sel.filter((id) => store.get(id)));
  });

  const stamp = <E extends Entity>(e: Omit<E, 'updatedAt' | 'updatedBy' | 'deleted'>): E =>
    ({ ...e, updatedAt: Date.now(), updatedBy: user.id, deleted: false }) as unknown as E;

  function newTripEntities(name = t('trip.defaultName')): Entity[] {
    const id = newId();
    return [
      stamp<Trip>({ id, type: 'trip', tripId: id, name, ownerId: user.id }),
      stamp<Stage>({
        id: newId(),
        type: 'stage',
        tripId: id,
        order: keyBetween(null, null),
        name: t('tree.stageName', { n: 1 }),
        notes: '',
        color: STAGE_COLORS[0],
      }),
    ];
  }

  /** Trips in this browser, and switching between them (by reloading the app). */
  const trips = {
    async listLocal(): Promise<Trip[]> {
      return db ? listTrips(db) : [];
    },
    async open(id: string): Promise<void> {
      await flushLocal();
      settings.set('tripId', id);
      location.reload();
    },
    async create(name?: string): Promise<void> {
      await trips.add(newTripEntities(name));
    },
    /** Saves a complete trip (e.g. a restored backup) and opens it. */
    async add(entities: Entity[]): Promise<void> {
      const trip = entities.find((e) => e.type === 'trip');
      if (!trip || !db) throw new Error(t('app.storageUnavailable'));
      await putEntities(db, entities);
      await trips.open(trip.id);
    },
  };

  async function loadLocalTrip(): Promise<void> {
    try {
      db = await openDb({
        onBlocked: () => ui.notify(t('app.otherTabOld'), 'warn', 0),
        onReplaced: () => ui.notify(t('app.replacedByNewer'), 'warn', 0, { label: t('update.reload'), run: () => location.reload() }),
      });
    } catch (err) {
      console.warn(err);
      ui.notify(t('app.storageUnavailable'), 'warn', 0);
    }

    // A shared trip just joined has no local data yet; sync fills it in.
    let id: string | null = null;
    let entities: Entity[] = [];
    if (db) {
      const wanted = settings.get<string | null>('tripId', null);
      const local = await listTrips(db);
      const shared = cloudSettings.get<string[]>('sharedTrips', []);
      id = wanted && (local.some((tr) => tr.id === wanted) || shared.includes(wanted)) ? wanted : (local[0]?.id ?? null);
      if (id) entities = await loadTripEntities(db, id);
    }

    const fresh = !id;
    if (fresh) entities = newTripEntities();
    tripId = id ?? entities.find((e) => e.type === 'trip')!.id;
    settings.set('tripId', tripId);

    store.apply(entities, fresh ? 'local' : 'load');
    if (db) {
      const target = db;
      const saver = attachDebouncedSave(store, { write: (list) => putEntities(target, list) }, (err) => {
        console.error(err);
        ui.notify(t('app.saveFailed'), 'error');
      });
      if (fresh) await putEntities(db, entities);
      flushLocal = saver.flush;
      window.addEventListener('pagehide', () => void saver.flush());
    }
    visibility.load();
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
          cloud,
          trips,
          visibility,
          history,
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
      void cloud.start();
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
    cloud,
    trips,
    visibility,
    history,
    t,
    status: { subscribe: status.subscribe } as Readable<CoreStatus>,
    firstVisit,
    get tripId() {
      return tripId;
    },
    start,
  };
}

export type Core = ReturnType<typeof createCore>;
