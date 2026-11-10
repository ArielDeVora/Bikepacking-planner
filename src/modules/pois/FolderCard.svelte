<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { deleteFolderCommand, folderPlaces } from '../../lib/places/folders';
  import type { PoiFolder } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);

  const folder = $derived.by(() => {
    void $store;
    return store.get(id, 'poiFolder');
  });
  const count = $derived.by(() => {
    void $store;
    return folderPlaces(store, id).length;
  });

  function edit(patch: Partial<PoiFolder>, field: string) {
    commands.run({ label: t('cmd.editFolder'), changes: [edits.update<PoiFolder>(store, id, patch)], mergeKey: `poiFolder:${id}:${field}` });
  }

  function remove() {
    commands.run(deleteFolderCommand(store, id, t('cmd.deleteFolder')));
    selection.clear();
  }
</script>

{#if folder}
  <p class="muted small">{t('folder.count', { n: count })}</p>
  <div class="row">
    <label class="field">
      <span>{t('folder.name')}</span>
      <input type="text" value={folder.name} oninput={(e) => edit({ name: e.currentTarget.value }, 'name')} onblur={() => commands.seal()} />
    </label>
    <div class="field color">
      <label for="folder-color-{id}">{t('folder.color')}</label>
      <span class="color-row">
        <input
          id="folder-color-{id}"
          type="color"
          value={folder.color ?? '#d9480f'}
          onchange={(e) => edit({ color: e.currentTarget.value }, 'color')}
        />
        {#if folder.color}
          <button type="button" class="clear" aria-label="×" onclick={() => edit({ color: undefined }, 'color')}>×</button>
        {/if}
      </span>
    </div>
  </div>
  <div class="actions">
    <button type="button" class="btn danger" title={t('folder.deleteHint')} onclick={remove}>{t('folder.delete')}</button>
    <span class="muted small">{t('folder.deleteHint')}</span>
  </div>
{/if}

<style>
  .small {
    margin: 0 28px 8px 0;
    font-size: 12px;
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
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 10px 0 0;
  }

  .actions .small {
    margin: 0;
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
