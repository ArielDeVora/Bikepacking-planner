<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import type { LngLat, PoiCategory } from '../../model/types';
  import { osmDetails } from './details';
  import PlaceInfo from './PlaceInfo.svelte';
  import { resolveCategory } from './categories';
  import { createPoiCommand } from './poi';

  /** A place that isn't in the trip (an OSM feature or a search result). */
  export interface Place {
    name: string;
    kind: string;
    lngLat: LngLat;
    category: PoiCategory;
    osm?: { type: 'node' | 'way' | 'relation'; id: number; tags: Record<string, string> };
  }

  let { ctx, place }: { ctx: ModuleContext; place: Place } = $props();
  const { t } = $derived(ctx);

  // Nominatim gives the English name when OSM has one (the map shows the local name).
  let englishName = $state<string | null>(null);
  $effect(() => {
    const ref = place.osm;
    englishName = null;
    if (ref) void osmDetails(ref.type, ref.id).then((d) => (englishName = d?.tags.name ?? null));
  });
  const title = $derived(englishName || place.name);

  function add() {
    // Plain copies: the place may come from reactive state (search results), which can't be stored.
    const { lngLat, osm } = $state.snapshot(place);
    const { command, id } = createPoiCommand(
      {
        tripId: ctx.tripId,
        userId: ctx.user.id,
        lngLat,
        name: title || place.kind,
        category: resolveCategory(ctx.store, place.category),
        osm: osm ? { ...osm, fetchedAt: Date.now() } : undefined,
      },
      t('cmd.addPoi'),
    );
    ctx.commands.run(command);
    ctx.selection.set([id]);
  }
</script>

<h3>{title || place.kind}</h3>
{#if title && place.kind}<p class="kind muted">{place.kind}{englishName && place.name && englishName !== place.name ? ` · ${place.name}` : ''}</p>{/if}
<PlaceInfo {ctx} lngLat={place.lngLat} name={title || place.kind} osm={place.osm} />
<button type="button" class="add" onclick={add}>{t('place.addToTrip')}</button>

<style>
  h3 {
    margin: 0 28px 2px 0;
    font-size: 15px;
  }

  .kind {
    margin: 0 0 10px;
    font-size: 12px;
  }

  .add {
    width: 100%;
    margin-top: 12px;
    padding: 6px;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-fg);
    cursor: pointer;
  }
</style>
