import type { ModuleLoader } from '../core/module';

// Feature modules, set up in this order. Adding a feature = a folder here + one line below.
export const modules: ModuleLoader[] = [
  () => import('./map-layers'),
  () => import('./trip-tree'),
  () => import('./routes'),
  () => import('./collab'),
  () => import('./io'),
  () => import('./elevation'),
  () => import('./stats'),
];
