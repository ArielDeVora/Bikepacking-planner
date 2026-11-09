<script lang="ts">
  import type { ModuleContext } from '../../core/module';

  let { ctx, focus }: { ctx: ModuleContext; focus: (id: string) => void } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);
  const zones = $derived.by(() => {
    void $store;
    return store.list('zone').sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  });
</script>

<p class="muted small">{t('zone.addHint')}</p>
{#if zones.length}
  <ul>
    {#each zones as z (z.id)}
      <li class:selected={$selected.includes(z.id)}>
        <button type="button" onclick={() => focus(z.id)}>
          <span class="dot {z.kind === 'risk' ? 'risk' : z.severity}"></span>
          <span class="label">{z.name || t('zone.newName')}</span>
          <span class="muted small">{z.kind === 'risk' ? t('zone.kind.risk') : t(z.severity === 'nogo' ? 'zone.nogo' : 'zone.caution')}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .small {
    font-size: 12px;
  }

  p {
    margin: 0 0 6px;
  }

  ul {
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

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .dot.nogo {
    background: #e03131;
  }

  .dot.risk {
    background: #862e9c;
  }

  .dot.caution {
    background: #f08c00;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
