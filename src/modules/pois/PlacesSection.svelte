<script lang="ts">
  import { POI_CATEGORIES, POI_STATUS_ORDER } from '../../config/pois';
  import type { ModuleContext } from '../../core/module';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { PoiStatus } from '../../model/types';

  let { ctx, focus }: { ctx: ModuleContext; focus: (id: string) => void } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);

  const LIMIT = 200;
  let status = $state<PoiStatus | 'all'>('all');

  const pois = $derived.by(() => {
    void $store;
    return store.list('poi', (p) => status === 'all' || p.status === status).sort((a, b) => a.name.localeCompare(b.name));
  });
</script>

<div class="head">
  <select bind:value={status} aria-label={t('poi.status')}>
    <option value="all">{t('poi.all')}</option>
    {#each POI_STATUS_ORDER as s (s)}
      <option value={s}>{t(`poi.status.${s}`)}</option>
    {/each}
  </select>
  <span class="muted small">{t('poi.addHint')}</span>
</div>
{#if pois.length}
  <ul>
    {#each pois.slice(0, LIMIT) as poi (poi.id)}
      <li class:selected={$selected.includes(poi.id)}>
        <button type="button" onclick={() => focus(poi.id)}>
          <span class="icon" style:background={POI_CATEGORIES[poi.category].color}><Icon d={POI_CATEGORIES[poi.category].icon} size={11} /></span>
          <span class="label">{poi.name || t('poi.untitled')}</span>
          {#if poi.status !== 'idea'}<span class="tag {poi.status}">{t(`poi.status.${poi.status}`)}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
  {#if pois.length > LIMIT}<p class="muted small">{t('poi.more', { n: pois.length - LIMIT })}</p>{/if}
{:else}
  <p class="muted small">{t('poi.empty')}</p>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .head select {
    width: auto;
    padding: 3px 6px;
  }

  .small {
    font-size: 12px;
  }

  ul {
    max-height: 260px;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  li button:hover {
    background: var(--bg-hover);
  }

  li.selected button {
    background: var(--accent-soft);
  }

  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--bg-sunken);
    font-size: 11px;
  }

  .tag.mustSee {
    color: #b45309;
  }

  .tag.booked {
    color: #2f9e44;
  }

  .tag.skip {
    color: var(--fg-muted);
  }
</style>
