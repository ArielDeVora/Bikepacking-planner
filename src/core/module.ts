import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Trip } from '../model/types';
import type { EventBus, Events } from './bus';
import type { Cloud } from './cloud/cloud';
import type { CommandStack } from './commands';
import type { t } from './i18n';
import type { LayerManager } from './layers';
import type { Selection } from './selection';
import type { Settings } from './settings';
import type { ShortcutManager } from './shortcuts';
import type { TripStore } from './store';
import type { UiRegistry } from './ui';

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
  readonly user: { id: string };
  /** Sign-in, sharing and sync. */
  readonly cloud: Cloud;
  readonly trips: TripManager;
  readonly tripId: string;
  readonly t: typeof t;
}

export interface TripManager {
  listLocal(): Promise<Trip[]>;
  /** Reloads the app on another trip. */
  open(id: string): Promise<void>;
  create(name?: string): Promise<void>;
}

export type Teardown = () => void;

export interface Module {
  id: string;
  setup(ctx: ModuleContext): void | Teardown | Promise<void | Teardown>;
}

export type ModuleLoader = () => Promise<{ default: Module }>;

export const defineModule = (m: Module): Module => m;
