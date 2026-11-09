# Milestone 1: Skeleton

## What was built

- Vite + Svelte 5 + TypeScript app, deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- Full-screen MapLibre map with a collapsible left panel, a slim floating toolbar, an info card for the selection, and toasts.
- Core services: entity store, command/undo system, selection, typed event bus, layer slots and overlay registry, keyboard shortcuts, settings, i18n, light/dark theme.
- Local persistence in IndexedDB (debounced writes, flushed when the tab is hidden).
- Two modules:
  - `map-layers`: base map switcher (OpenFreeMap, OSM, CyclOSM, OpenTopoMap, Sentinel-2 satellite), hillshading overlay, and the layer panel with per-overlay opacity.
  - `trip-tree`: trip name, stage list (add / reorder / delete), and the stage info card (name, date, colour, notes).

## Layout

```
src/
  main.ts            creates the core, mounts the UI, starts the modules
  app/               shell UI: panel, toolbar, info card, toasts
  core/              everything modules depend on (see below)
  model/             entity types, ids, fractional order keys
  i18n/en.ts         every UI string
  lib/               shared helpers and UI primitives (icons, IconButton)
  modules/           one folder per feature + index.ts (the registry)
  styles/theme.css   CSS variables, light/dark tokens, base styles
```

## Core concepts

### Entities and the store

Every entity (`src/model/types.ts`) is flat and has `id`, `type`, `tripId`, `updatedAt`, `updatedBy` and `deleted`. Children point at their parent (`segment.stageId`) and carry their own fractional `order` key (`src/model/order.ts`), so reordering touches only the moved item.

`TripStore` (`src/core/store.ts`) holds all entities of the current trip, including soft-deleted ones. `get` / `list` hide deleted entities. Every change carries an origin (`local`, `remote`, `load`) so persistence and sync know what to write. In Svelte, `$store` yields a version number that changes on every write:

```svelte
const stages = $derived.by(() => {
  void $store;
  return store.list('stage');
});
```

### Commands and undo

All edits go through `ctx.commands.run(command)`. A command is a list of `{ id, before, after }` changes built with `edits.create / update / remove`:

```ts
commands.run({
  label: t('cmd.renameStage'),
  changes: [edits.update<Stage>(store, id, { name })],
});
```

- Undo writes `before` (or soft-deletes, for creations); redo writes `after`. Each applied entity is stamped with `updatedAt` and `updatedBy`.
- Commands with the same `mergeKey` collapse into one undo step (typing, dragging). `commands.seal()` ends the merge (call it on blur or drag end).
- Each change maps one-to-one to an entity write, which is what persistence (and later sync) consumes.
- `commands.patch(changes)` writes without an undo step. It is only for data derived from an earlier command that can be derived again, such as routed geometry (see [milestone 2](02-routes.md)).

### Persistence

`core/persistence/idb.ts` stores one record per entity, indexed by `tripId` and `type`. `attachDebouncedSave` writes changed entities 400 ms after the last edit and immediately when the page is hidden. Failed writes are retried on the next flush.

### Layers

`LayerManager` (`core/layers.ts`) appends hidden marker layers after the base style, one per slot: `base`, `overlay`, `route`, `poi`, `top`. `layers.addLayer(spec, slot)` inserts at the top of that slot, so modules don't need to know about each other's layers to get a sensible draw order.

`layers.registerOverlay({ id, label, layerIds, visible, opacity })` adds a row to the layer panel. Visibility and opacity are remembered per browser.

### Event bus

`ctx.bus` is typed by the `Events` interface in `core/bus.ts`. A module declares its own events with declaration merging:

```ts
declare module '../../core/bus' {
  interface Events {
    'routing:failed': { segmentId: string; reason: string };
  }
}
```

## Adding a module

1. Create `src/modules/<name>/index.ts`:

   ```ts
   import { defineModule } from '../../core/module';
   import { icons } from '../../lib/icons';
   import MyCard from './MyCard.svelte';
   import MyLegend from './MyLegend.svelte';
   import MySection from './MySection.svelte';

   export default defineModule({
     id: '<name>',
     setup(ctx) {
       ctx.layers.addSource('my-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
       ctx.layers.addLayer({ id: 'my-layer', type: 'line', source: 'my-source' }, 'overlay');
       ctx.ui.addPanelSection({ id: '<name>', title: 'My feature', component: MySection, props: { ctx } });
       ctx.ui.addTool({ id: '<name>.tool', label: 'My tool', icon: icons.plus, shortcut: 'm', run: () => {} });
       ctx.shortcuts.add({ keys: 'm', label: 'My tool', run: () => {} });
       ctx.ui.addCardRenderer('poi', { component: MyCard, props: { ctx } });
       ctx.ui.addWidget({ id: '<name>.legend', component: MyLegend, props: { ctx } });
     },
   });
   ```

2. Add one line to `src/modules/index.ts`.

What a module receives (`ModuleContext`, `core/module.ts`): `map`, `store`, `commands`, `selection`, `bus`, `layers`, `ui`, `shortcuts`, `settings` (namespaced to the module), `user`, `cloud` (sign-in, members, sync status; see [milestone 3](03-collaboration.md)), `trips` (list, open, create), `tripId`, `t`.

`ui` also has `addCardSection({ id, component, types? })` for content under other modules' info cards (comments, "edited by").

Rules:

- Modules import from `core/`, `model/` and `lib/`, never from another module.
- Every data change goes through `commands.run`.
- Put user-facing strings in `src/i18n/en.ts`.
- Modules are loaded with dynamic `import()`, each in its own chunk. Heavy dependencies inside a module should also be imported lazily, at first use.

## Map sources and terms

| Layer | Source | Terms |
| --- | --- | --- |
| Default vector base | OpenFreeMap (Liberty style) | Free, no key, no request limits; attribution required (added by the style). |
| OpenStreetMap | tile.openstreetmap.org | OSMF tile usage policy: light use only, attribution, no bulk downloading. |
| CyclOSM | OSM France tile server | Light use with attribution. |
| OpenTopoMap | opentopomap.org | Light use with attribution (CC-BY-SA style). Max zoom 17. |
| Satellite | EOxCloudless 2023 (Sentinel-2) | CC BY-NC-SA 4.0: non-commercial use with attribution. 10 m resolution, so it gets blurry past zoom ~14. |
| Hillshading | AWS Terrain Tiles (Terrarium) | AWS open data, no key; attribution to the underlying sources. |

Higher-resolution satellite imagery (Esri World Imagery) needs a free ArcGIS developer account and API key. It is not included.

## Known limitations

- One local trip per browser. Trip switching and sharing come with the collaboration milestone.
- A module's `setup` runs once. Teardown functions are returned but not yet called (nothing unloads modules).
