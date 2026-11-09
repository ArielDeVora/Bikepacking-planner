<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { inTripOrder, mergeManyCommand, moveSegmentsCommand } from '../../lib/segment-edits';
  import LineStyleFields from '../../lib/ui/LineStyleFields.svelte';
  import { lineStyleOf } from '../../lib/ui/line-style';
  import { MODES } from '../../config/modes';
  import { compareOrder } from '../../model/order';
  import type { Segment } from '../../model/types';

  let { ids, ctx }: { ids: string[]; ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);

  const DELETABLE = new Set(['segment', 'poi', 'zone', 'borderCrossing']);

  const items = $derived.by(() => {
    void $store;
    return ids.map((id) => store.get(id)).filter((e) => !!e);
  });
  const segments = $derived.by(() => inTripOrder(store, items.filter((e) => e.type === 'segment')));
  const deletable = $derived(items.filter((e) => DELETABLE.has(e.type)));
  const stages = $derived.by(() => {
    void $store;
    return store.list('stage').sort(compareOrder);
  });
  const km = $derived(segments.reduce((sum, s) => sum + s.stats.lengthM, 0) / 1000);
  const climb = $derived(segments.reduce((sum, s) => sum + s.stats.ascentM, 0));

  function fuse() {
    const cmd = mergeManyCommand(store, segments, t('cmd.merge'));
    if (!cmd) return;
    commands.run(cmd);
    selection.set([segments[0]!.id]);
  }

  function restyle(patch: Partial<Segment>, field: string) {
    commands.run({ label: t('cmd.lineStyle'), changes: segments.map((s) => edits.update<Segment>(store, s.id, patch)), mergeKey: `segments:${field}` });
  }

  function moveTo(stageId: string) {
    const cmd = moveSegmentsCommand(store, segments.map((s) => s.id), stageId, null, t('cmd.moveSegment'));
    if (cmd) commands.run(cmd);
  }
</script>

<h3>{t('multi.selected', { n: items.length })}</h3>
{#if segments.length}
  <p class="muted small">
    {t('multi.segments', { n: segments.length })} · {km.toFixed(km < 100 ? 1 : 0)} km{climb ? ` · ↗ ${climb.toLocaleString()} m` : ''}
  </p>
{/if}

<div class="actions">
  {#if segments.length >= 2}
    <button type="button" class="btn primary" onclick={fuse} title={t('multi.fuseHint')}>{t('multi.fuse', { n: segments.length })}</button>
  {/if}
  {#if deletable.length}
    <button type="button" class="btn danger" onclick={() => commands.run({ label: t('tree.delete'), changes: deletable.map((e) => edits.remove(store, e.id)) })}>
      {t('multi.delete', { n: deletable.length })}
    </button>
  {/if}
</div>

{#if segments.length}
  <label class="field">
    <span>{t('multi.moveTo')}</span>
    <select value="" onchange={(e) => e.currentTarget.value && moveTo(e.currentTarget.value)}>
      <option value="" disabled>{t('multi.chooseStage')}</option>
      {#each stages as st (st.id)}
        <option value={st.id}>{st.name}</option>
      {/each}
    </select>
  </label>
{/if}
{#if segments.length}
  <div class="style">
    <span class="muted small">{t('multi.lineStyle')}</span>
    <LineStyleFields
      {t}
      value={lineStyleOf(segments)}
      shownColor={lineStyleOf(segments).color ?? '#e8590c'}
      shownWidth={lineStyleOf(segments).width ?? MODES[segments[0]!.mode].style.width}
      onChange={restyle}
      onDone={() => commands.seal()}
    />
  </div>
{/if}
<p class="muted small">{t('multi.hint')}</p>

<style>
  h3 {
    margin: 0 28px 4px 0;
    font-size: 15px;
  }

  .small {
    font-size: 12px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }

  .style {
    margin: 8px 0;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .btn.danger {
    color: var(--danger);
  }
</style>
