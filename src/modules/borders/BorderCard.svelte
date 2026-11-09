<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import PlaceInfo from '../../lib/places/PlaceInfo.svelte';
  import type { BorderCrossing, CrossingStatus } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const crossing = $derived.by(() => {
    void $store;
    return store.get(id, 'borderCrossing');
  });
  const STATUSES: CrossingStatus[] = ['open', 'closedToForeigners', 'unknown'];

  function patch(p: Partial<BorderCrossing>, field?: string) {
    commands.run({ label: t('cmd.editCrossing'), changes: [edits.update<BorderCrossing>(store, id, p)], ...(field ? { mergeKey: `crossing:${id}:${field}` } : {}) });
  }
  const today = () => new Date().toISOString().slice(0, 10);
</script>

{#if crossing}
  <label class="field">
    <span>{t('border.name')}</span>
    <input type="text" value={crossing.name} oninput={(e) => patch({ name: e.currentTarget.value }, 'name')} onblur={() => commands.seal()} />
  </label>
  <div class="field">
    <span>{t('border.status')}</span>
    <div class="seg" role="radiogroup">
      {#each STATUSES as s (s)}
        <button type="button" class="{s}" class:active={crossing.status === s} onclick={() => patch({ status: s })}>{t(`border.status.${s}`)}</button>
      {/each}
    </div>
  </div>
  <label class="field">
    <span>{t('border.notes')}</span>
    <textarea value={crossing.notes} oninput={(e) => patch({ notes: e.currentTarget.value }, 'notes')} onblur={() => commands.seal()}></textarea>
  </label>
  <label class="field">
    <span>{t('border.link')}</span>
    <input type="url" placeholder="https://caravanistan.com/border-crossings/…" value={crossing.link ?? ''} onchange={(e) => patch({ link: e.currentTarget.value || undefined })} />
    {#if crossing.link}<a href={crossing.link} target="_blank" rel="noopener noreferrer" class="small">{t('border.openLink')}</a>{/if}
  </label>
  <div class="field">
    <span>{t('border.lastVerified')}</span>
    <div class="verified">
      <input type="date" value={crossing.lastVerified ?? ''} onchange={(e) => patch({ lastVerified: e.currentTarget.value || undefined })} />
      <button type="button" class="link" onclick={() => patch({ lastVerified: today() })}>{t('border.today')}</button>
    </div>
  </div>
  <PlaceInfo {ctx} lngLat={crossing.lngLat} name={crossing.name} osm={crossing.osmNodeId ? { type: 'node', id: crossing.osmNodeId, tags: {} } : undefined} />
  <button type="button" class="danger" onclick={() => commands.run({ label: t('cmd.deleteCrossing'), changes: [edits.remove(store, id)] })}>
    {t('border.delete')}
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
    padding: 5px 2px;
    border: 0;
    background: var(--bg);
    font-size: 12px;
    cursor: pointer;
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg .open.active {
    background: #ebfbee;
    color: #2b8a3e;
  }

  .seg .closedToForeigners.active {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .seg .unknown.active {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .verified {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .small {
    font-size: 12px;
    color: var(--accent);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }

  .danger {
    margin-top: 10px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    cursor: pointer;
  }
</style>
