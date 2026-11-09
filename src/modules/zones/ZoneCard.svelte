<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import type { Zone } from '../../model/types';
  import { segmentsCrossing } from './crossings';

  let { id, ctx, reroute, focus }: { id: string; ctx: ModuleContext; reroute: (zoneIds: string[]) => number; focus: (id: string) => void } =
    $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const zone = $derived.by(() => {
    void $store;
    return store.get(id, 'zone');
  });
  const crossing = $derived.by(() => {
    void $store;
    return zone ? segmentsCrossing(zone, store.list('segment')) : [];
  });
  let rerouted = $state<number | null>(null);

  function patch(p: Partial<Zone>, field?: string) {
    commands.run({ label: t('cmd.editZone'), changes: [edits.update<Zone>(store, id, p)], ...(field ? { mergeKey: `zone:${id}:${field}` } : {}) });
  }
</script>

{#if zone}
  <label class="field">
    <span>{t('zone.name')}</span>
    <input type="text" value={zone.name} oninput={(e) => patch({ name: e.currentTarget.value }, 'name')} onblur={() => commands.seal()} />
  </label>
  <div class="field">
    <span>{t('zone.kind')}</span>
    <div class="seg" role="radiogroup">
      <button type="button" class="nogo" class:active={zone.kind === 'avoid'} onclick={() => patch({ kind: 'avoid' })}>{t('zone.kind.avoid')}</button>
      <button type="button" class="risk" class:active={zone.kind === 'risk'} onclick={() => patch({ kind: 'risk' })}>{t('zone.kind.risk')}</button>
    </div>
    <small class="muted">{zone.kind === 'risk' ? t('zone.riskHint') : t('zone.avoidHint')}</small>
  </div>
  {#if zone.kind === 'avoid'}
  <div class="field">
    <span>{t('zone.severity')}</span>
    <div class="seg" role="radiogroup">
      <button type="button" class="nogo" class:active={zone.severity === 'nogo'} onclick={() => patch({ severity: 'nogo' })}>{t('zone.nogo')}</button>
      <button type="button" class="caution" class:active={zone.severity === 'caution'} onclick={() => patch({ severity: 'caution' })}>
        {t('zone.caution')}
      </button>
    </div>
    <small class="muted">{zone.severity === 'nogo' ? t('zone.nogoHint') : t('zone.cautionHint')}</small>
  </div>
  {:else}
    <label class="field">
      <span>{t('zone.dataDate')}</span>
      <input type="date" value={zone.dataDate ?? ''} onchange={(e) => patch({ dataDate: e.currentTarget.value || undefined })} />
    </label>
  {/if}
  <label class="field">
    <span>{t('zone.reason')}</span>
    <textarea value={zone.reason} oninput={(e) => patch({ reason: e.currentTarget.value }, 'reason')} onblur={() => commands.seal()}></textarea>
  </label>
  <div class="row">
    <label class="field">
      <span>{t('zone.source')}</span>
      <input type="text" value={zone.source ?? ''} onchange={(e) => patch({ source: e.currentTarget.value || undefined })} />
    </label>
    <label class="field">
      <span>{t('zone.sourceUrl')}</span>
      <input type="url" value={zone.sourceUrl ?? ''} onchange={(e) => patch({ sourceUrl: e.currentTarget.value || undefined })} />
    </label>
  </div>
  <p class="muted small">{t('zone.added', { date: new Date(zone.addedAt).toLocaleDateString() })}</p>
  {#if zone.kind === 'risk'}
    <p class="muted small">{t('zone.riskDisclaimer', { date: zone.dataDate ? new Date(zone.dataDate).toLocaleDateString() : '—' })}</p>
  {/if}

  {#if crossing.length}
    <div class="warn">
      <strong>{t('zone.crossedBy', { n: crossing.length })}</strong>
      <ul>
        {#each crossing as s (s.id)}
          <li><button type="button" class="link" onclick={() => focus(s.id)}>{s.name}</button>{s.geomType === 'routed' ? '' : ` (${t('zone.manual')})`}</li>
        {/each}
      </ul>
      {#if zone.kind === 'avoid' && zone.severity === 'nogo' && crossing.some((s) => s.geomType === 'routed')}
        <button type="button" class="btn" onclick={() => (rerouted = reroute([id]))}>{t('zone.reroute')}</button>
      {/if}
      {#if rerouted !== null}<p class="small">{t('zone.rerouted', { n: rerouted })}</p>{/if}
    </div>
  {/if}

  <p class="hint muted small">{t('zone.editHint')}</p>
  <button type="button" class="danger" onclick={() => commands.run({ label: t('cmd.deleteZone'), changes: [edits.remove(store, id)] })}>
    {t('zone.delete')}
  </button>
{/if}

<style>
  .seg {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg button {
    flex: 1;
    padding: 5px;
    border: 0;
    background: var(--bg);
    cursor: pointer;
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg .nogo.active {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .seg .risk.active {
    background: #f8f0fc;
    color: #862e9c;
  }

  .seg .caution.active {
    background: #fff4e6;
    color: #d9480f;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .small {
    font-size: 12px;
  }

  .warn {
    margin: 8px 0;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    font-size: 13px;
  }

  .warn ul {
    margin: 4px 0 8px;
    padding-left: 18px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }

  .btn,
  .danger {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .danger {
    color: var(--danger);
  }
</style>
