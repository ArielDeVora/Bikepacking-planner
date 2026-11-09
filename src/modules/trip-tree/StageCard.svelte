<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import type { Stage } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const stage = $derived.by(() => {
    void $store;
    return store.get(id, 'stage');
  });

  type Field = 'name' | 'notes' | 'plannedDate' | 'color';

  function edit(field: Field, value: string) {
    const patch: Partial<Stage> = { [field]: value || (field === 'name' || field === 'notes' ? '' : undefined) };
    commands.run({
      label: t('cmd.editStage'),
      changes: [edits.update<Stage>(store, id, patch)],
      mergeKey: `stage:${id}:${field}`,
    });
  }
</script>

{#if stage}
  <label class="field">
    <span>{t('stage.name')}</span>
    <input type="text" value={stage.name} oninput={(e) => edit('name', e.currentTarget.value)} onblur={() => commands.seal()} />
  </label>
  <div class="row">
    <label class="field">
      <span>{t('stage.plannedDate')}</span>
      <input type="date" value={stage.plannedDate ?? ''} onchange={(e) => edit('plannedDate', e.currentTarget.value)} />
    </label>
    <label class="field color">
      <span>{t('stage.color')}</span>
      <input type="color" value={stage.color ?? '#d9480f'} onchange={(e) => edit('color', e.currentTarget.value)} />
    </label>
  </div>
  <label class="field">
    <span>{t('stage.notes')}</span>
    <textarea value={stage.notes} oninput={(e) => edit('notes', e.currentTarget.value)} onblur={() => commands.seal()}></textarea>
  </label>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .color input {
    width: 44px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }
</style>
