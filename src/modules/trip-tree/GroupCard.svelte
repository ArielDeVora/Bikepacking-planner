<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { deleteGroupCommand, ungroupCommand } from '../../lib/segment-edits';
  import type { Group } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);

  const group = $derived.by(() => {
    void $store;
    return store.get(id, 'group');
  });
  const stage = $derived.by(() => {
    void $store;
    return group ? store.get(group.stageId, 'stage') : undefined;
  });

  type Field = 'name' | 'notes' | 'plannedDate' | 'color';

  function edit(field: Field, value: string | undefined) {
    const patch: Partial<Group> = { [field]: value || (field === 'name' || field === 'notes' ? '' : undefined) };
    commands.run({
      label: t('cmd.editGroup'),
      changes: [edits.update<Group>(store, id, patch)],
      mergeKey: `group:${id}:${field}`,
    });
  }

  function ungroup() {
    const cmd = ungroupCommand(store, id, t('cmd.ungroup'));
    if (!cmd) return;
    const segmentIds = cmd.changes.filter((c) => c.after.type === 'segment').map((c) => c.id);
    commands.run(cmd);
    selection.set(segmentIds);
  }

  function remove() {
    commands.run(deleteGroupCommand(store, id, t('cmd.deleteGroup')));
    selection.clear();
  }
</script>

{#if group}
  {#if stage}
    <p class="muted small">
      <span class="swatch" style:background={stage.color ?? 'var(--accent)'}></span>
      {t('group.inStage', { stage: stage.name })}
    </p>
  {/if}
  <label class="field">
    <span>{t('group.name')}</span>
    <input type="text" value={group.name} oninput={(e) => edit('name', e.currentTarget.value)} onblur={() => commands.seal()} />
  </label>
  <div class="row">
    <label class="field">
      <span>{t('group.plannedDate')}</span>
      <input type="date" value={group.plannedDate ?? ''} onchange={(e) => edit('plannedDate', e.currentTarget.value)} />
    </label>
    <div class="field color">
      <label for="group-color-{id}">{t('group.color')}</label>
      <span class="color-row">
        <input
          id="group-color-{id}"
          type="color"
          title={t('group.colorHint')}
          value={group.color ?? stage?.color ?? '#d9480f'}
          onchange={(e) => edit('color', e.currentTarget.value)}
        />
        {#if group.color}
          <button type="button" class="clear" title={t('group.stageColor')} aria-label={t('group.stageColor')} onclick={() => edit('color', undefined)}>×</button>
        {/if}
      </span>
    </div>
  </div>
  <label class="field">
    <span>{t('group.notes')}</span>
    <textarea value={group.notes} oninput={(e) => edit('notes', e.currentTarget.value)} onblur={() => commands.seal()}></textarea>
  </label>
  <div class="actions">
    <button type="button" class="btn" title={t('group.ungroupHint')} onclick={ungroup}>{t('tree.ungroup')}</button>
    <button type="button" class="btn danger" onclick={remove}>{t('group.delete')}</button>
  </div>
{/if}

<style>
  .small {
    margin: 0 28px 8px 0;
    font-size: 12px;
  }

  .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 4px;
    border-radius: 50%;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .color > label {
    font-size: 12px;
    color: var(--fg-muted);
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .color input {
    width: 44px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .clear {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 0;
  }

  .btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn.danger {
    color: var(--danger);
  }
</style>
