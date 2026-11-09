import type { Map as MapLibreMap } from 'maplibre-gl';
import type { EventBus, Events } from './bus';
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
  readonly tripId: string;
  readonly t: typeof t;
}

export type Teardown = () => void;

export interface Module {
  id: string;
  setup(ctx: ModuleContext): void | Teardown | Promise<void | Teardown>;
}

export type ModuleLoader = () => Promise<{ default: Module }>;

export const defineModule = (m: Module): Module => m;
