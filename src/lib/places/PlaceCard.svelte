<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import type { LngLat, PoiCategory } from '../../model/types';
  import PlaceInfo from './PlaceInfo.svelte';
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

  function add() {
    const { command, id } = createPoiCommand(
      {
        tripId: ctx.tripId,
        userId: ctx.user.id,
        lngLat: place.lngLat,
        name: place.name || place.kind,
        category: place.category,
        osm: place.osm ? { ...place.osm, fetchedAt: Date.now() } : undefined,
      },
      t('cmd.addPoi'),
    );
    ctx.commands.run(command);
    ctx.selection.set([id]);
  }
</script>

<h3>{place.name || place.kind}</h3>
{#if place.name && place.kind}<p class="kind muted">{place.kind}</p>{/if}
<PlaceInfo {ctx} lngLat={place.lngLat} name={place.name || place.kind} osm={place.osm} />
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
