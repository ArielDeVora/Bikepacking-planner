import type { HistoryLog } from './history/log';
import type { HistoryRecorder } from './history/recorder';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Entity, Trip } from '../model/types';
import type { EventBus, Events } from './bus';
import type { Cloud } from './cloud/cloud';
import type { CommandStack } from './commands';
import type { t } from './i18n';
import type { LayerManager } from './layers';
import type { PreferenceStore } from './preferences';
import type { Selection } from './selection';
import type { Settings } from './settings';
import type { ShortcutManager } from './shortcuts';
import type { TripStore } from './store';
import type { UiRegistry } from './ui';
import type { Visibility } from './visibility';

export interface ModuleContext {
  readonly map: MapLibreMap;
  readonly store: TripStore;
  readonly commands: CommandStack;
  readonly selection: Selection;
  readonly bus: EventBus<Events>;
  readonly layers: LayerManager;
  readonly ui: UiRegistry;
  readonly shortcuts: ShortcutManager;
  /** Preferences namespaced to this module. */
  readonly settings: Settings;
  /** App-wide preferences (the Settings window). */
  readonly prefs: PreferenceStore;
  readonly user: { id: string };
  /** Sign-in, sharing and sync. */
  readonly cloud: Cloud;
  readonly trips: TripManager;
  /** Routes, stages, groups and segments hidden from the map (per browser). */
  readonly visibility: Visibility;
  /** The trip's history: commits, and marking a restore. */
  readonly history: { log: HistoryLog; recorder: HistoryRecorder };
  readonly tripId: string;
  readonly t: typeof t;
}

export interface TripManager {
  listLocal(): Promise<Trip[]>;
  /** Reloads the app on another trip. */
  open(id: string): Promise<void>;
  create(name?: string): Promise<void>;
  /** Saves a complete trip (e.g. a restored backup) and opens it. */
  add(entities: Entity[]): Promise<void>;
}

export type Teardown = () => void;

export interface Module {
  id: string;
  setup(ctx: ModuleContext): void | Teardown | Promise<void | Teardown>;
}

export type ModuleLoader = () => Promise<{ default: Module }>;

export const defineModule = (m: Module): Module => m;
