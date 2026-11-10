import type { ModuleLoader } from '../core/module';

// Feature modules, set up in this order. Adding a feature = a folder here + one line below.
// The order also decides which map click wins when things overlap: earlier modules first.
export const modules: ModuleLoader[] = [
  () => import('./map-layers'),
  () => import('./trip-tree'),
  () => import('./routes'),
  () => import('./pois'),
  () => import('./search'),
  () => import('./borders'),
  () => import('./osm'),
  () => import('./zones'),
  () => import('./risk'),
  () => import('./collab'),
  () => import('./io'),
  () => import('./elevation'),
  () => import('./stats'),
  () => import('./editing'),
  () => import('./history'),
  () => import('./climate'),
];
