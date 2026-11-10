<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { segmentsOf } from '../../lib/tree';
  import { segmentCoords } from '../../model/segment';
  import { weekOf, weekDay } from './codec';
  import { valueAt } from './data';
  import type { ClimateState } from './state';

  let { id, ctx, climate }: { id: string; ctx: ModuleContext; climate: Writable<ClimateState> } = $props();
  const t = $derived(ctx.t);
  const store = $derived(ctx.store);

  /** The planned date: the item's own, or its stage's. */
  const date = $derived.by(() => {
    void $store;
    const e = store.get(id);
    if (!e || (e.type !== 'stage' && e.type !== 'group' && e.type !== 'segment')) return null;
    const stage = e.type === 'stage' ? e : store.get(e.stageId, 'stage');
    const own = e.plannedDate;
    return own || stage?.plannedDate || null;
  });
  /** The middle of the item's route. */
  const middle = $derived.by(() => {
    void $store;
    const coords = segmentsOf(store, id).flatMap((s) => segmentCoords(s));
    const c = coords[Math.floor(coords.length / 2)];
    return c ? ([c[0], c[1]] as [number, number]) : null;
  });

  let values = $state<{ high: number | null; low: number | null; rain: number | null } | null>(null);
  $effect(() => {
    values = null;
    if (!date || !middle) return;
    const day = weekDay(weekOf(new Date(`${date}T12:00:00Z`)));
    const [lng, lat] = middle;
    void Promise.all([valueAt('tmax', day, lng, lat), valueAt('tmin', day, lng, lat), valueAt('ppt', day, lng, lat)])
      .then(([high, low, rain]) => (values = { high, low, rain }))
      .catch(() => (values = null));
  });

  const label = $derived(date ? new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '');
  const round = (v: number | null) => (v === null ? '–' : Math.round(v));

  function showOnMap() {
    if (!date) return;
    climate.update((s) => ({ ...s, week: weekOf(new Date(`${date}T12:00:00Z`)), playing: false }));
    if (!$climate.shown) ctx.layers.setOverlay('climate-rain', { visible: true });
  }
</script>

{#if middle}
  <section>
    <h4>{t('climate.expectedTitle')}</h4>
    {#if !date}
      <p class="muted">{t('climate.setDate')}</p>
    {:else if values && values.high !== null}
      <p>
        {t('climate.aroundDate', { date: label })}
        <strong>{round(values.high)}°</strong> / {round(values.low)}° · {t('climate.rainShort', { mm: round(values.rain) })}
      </p>
      <button type="button" class="link" onclick={showOnMap}>{t('climate.showOnMap')}</button>
    {:else if values}
      <p class="muted">{t('climate.noData')}</p>
    {:else}
      <p class="muted">{t('climate.loading')}</p>
    {/if}
  </section>
{/if}

<style>
  section {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  h4 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-muted);
  }

  p {
    margin: 0 0 4px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
</style>
