<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import { nextSegment } from '../../lib/segment-edits';
  import Icon from '../../lib/ui/Icon.svelte';
  import { compareOrder } from '../../model/order';
  import type { EditActions } from './index';

  let { id, ctx, actions }: { id: string; ctx: ModuleContext; actions: EditActions } = $props();
  const { t, shortcuts } = $derived(ctx);
  const store = $derived(ctx.store);
  const tool = $derived(ctx.ui.tool);

  const seg = $derived.by(() => {
    void $store;
    return store.get(id, 'segment');
  });
  const stages = $derived.by(() => {
    void $store;
    return store.list('stage').sort(compareOrder);
  });
  const hasNext = $derived.by(() => {
    void $store;
    return !!seg && !!nextSegment(store, seg);
  });

  const label = (text: string, keys?: string) => (keys ? `${text} (${shortcuts.format(keys)})` : text);
</script>

{#if seg}
  <section class="edit">
    {#if seg.geomType === 'imported'}
      <button type="button" class="btn primary wide" onclick={() => actions.makeEditable(id)}>
        <Icon d={icons.pencil} size={15} />
        {t('edit.makeEditable')}
      </button>
      <p class="muted hint">{t('edit.makeEditableHint')}</p>
    {/if}
    <div class="buttons">
      <button type="button" class="btn" class:active={$tool === 'editing.split'} title={label(t('edit.split'), 's')} onclick={actions.split}>
        <Icon d={icons.scissors} size={15} />{t('edit.split')}
      </button>
      <button type="button" class="btn" class:active={$tool === 'editing.erase'} title={label(t('edit.erase'), 'x')} onclick={actions.erase}>
        <Icon d={icons.eraser} size={15} />{t('edit.erase')}
      </button>
      <button type="button" class="btn" title={label(t('edit.reverse'), 'r')} onclick={() => actions.reverse(id)}>
        <Icon d={icons.reverse} size={15} />{t('edit.reverse')}
      </button>
      <button type="button" class="btn" title={label(t('edit.duplicate'), 'shift+d')} onclick={() => actions.duplicate(id)}>
        <Icon d={icons.copy} size={15} />{t('edit.duplicate')}
      </button>
      <button type="button" class="btn" disabled={!hasNext} title={label(t('edit.merge'), 'm')} onclick={() => actions.merge(id)}>
        <Icon d={icons.merge} size={15} />{t('edit.merge')}
      </button>
    </div>
    {#if $tool === 'editing.split'}
      <p class="muted hint">{t('edit.splitHint')}</p>
    {:else if $tool === 'editing.erase'}
      <p class="muted hint">{t('edit.eraseHint')}</p>
    {/if}
    <label class="field">
      <span>{t('edit.stage')}</span>
      <select value={seg.stageId} onchange={(e) => actions.moveTo(id, e.currentTarget.value)}>
        {#each stages as st (st.id)}
          <option value={st.id}>{st.name}</option>
        {/each}
      </select>
    </label>
  </section>
{/if}

<style>
  .edit {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    font-size: 12px;
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .btn.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .wide {
    width: 100%;
    justify-content: center;
    padding: 6px;
    font-size: 13px;
  }

  .hint {
    margin: 4px 0 8px;
    font-size: 12px;
  }
</style>
