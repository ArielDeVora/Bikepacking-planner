<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import type { BorderCrossing } from '../../model/types';
  import type { Crossing, CrossingState } from './countries';

  let {
    ctx,
    crossings,
    compute,
    open,
    annotationNear,
  }: {
    ctx: ModuleContext;
    crossings: Readable<CrossingState>;
    compute: () => void;
    open: (c: Crossing) => void;
    annotationNear: (c: Crossing) => BorderCrossing | undefined;
  } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  const rows = $derived.by(() => {
    void $store;
    return $crossings.crossings.map((c) => ({ c, note: annotationNear(c) }));
  });
</script>

{#if $crossings.status === 'idle'}
  <p class="muted small">{t('border.intro')}</p>
  <button type="button" class="btn" onclick={compute}>{t('border.compute')}</button>
{:else if $crossings.status === 'loading'}
  <p class="muted small">{t('border.loading')}</p>
{:else if $crossings.status === 'error'}
  <p class="small warn">{t('border.error')}</p>
  <button type="button" class="btn" onclick={compute}>{t('border.retry')}</button>
{:else if rows.length === 0}
  <p class="muted small">{t('border.none')}</p>
{:else}
  <p class="muted small">{t('border.howTo')}</p>
  <ol>
    {#each rows as { c, note }, i (i)}
      <li>
        <button type="button" onclick={() => open(c)}>
          <span class="label">{c.from.name} → {c.to.name}{c.byAir ? ' ✈' : ''}</span>
          {#if note}<span class="status {note.status}">{t(`border.status.${note.status}`)}</span>{/if}
          <span class="muted small">{Math.round(c.atM / 1000)} km</span>
        </button>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .small {
    font-size: 12px;
  }

  .warn {
    color: var(--warn);
  }

  p {
    margin: 0 0 6px;
  }

  .btn {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  ol {
    max-height: 280px;
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

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--bg-sunken);
  }

  .status.open {
    color: #2b8a3e;
  }

  .status.closedToForeigners {
    color: #c92a2a;
  }
</style>
