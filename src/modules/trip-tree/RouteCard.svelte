<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { deleteRouteCommand, dissolveRouteCommand, duplicateRouteCommand } from '../../lib/route-edits';
  import type { Route } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);

  const route = $derived.by(() => {
    void $store;
    return store.get(id, 'route');
  });

  type Field = 'name' | 'notes' | 'color' | 'source' | 'sourceUrl';

  function edit(field: Field, value: string | undefined) {
    const patch: Partial<Route> = { [field]: value || (field === 'name' || field === 'notes' ? '' : undefined) };
    commands.run({ label: t('cmd.editRoute'), changes: [edits.update<Route>(store, id, patch)], mergeKey: `route:${id}:${field}` });
  }

  function duplicate() {
    if (!route) return;
    const res = duplicateRouteCommand(store, id, t('route.copyName', { name: route.name }), t('cmd.duplicateRoute'));
    if (!res) return;
    commands.run(res.command);
    selection.set([res.routeId]);
  }

  function dissolve() {
    const cmd = dissolveRouteCommand(store, id, t('cmd.dissolveRoute'));
    if (cmd) commands.run(cmd);
    selection.clear();
  }

  function remove() {
    commands.run(deleteRouteCommand(store, id, t('cmd.deleteRoute')));
    selection.clear();
  }

  const safeUrl = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);
</script>

{#if route}
  <label class="field">
    <span>{t('route.name')}</span>
    <input type="text" value={route.name} oninput={(e) => edit('name', e.currentTarget.value)} onblur={() => commands.seal()} />
  </label>
  <div class="row">
    <label class="field">
      <span>{t('route.source')}</span>
      <input
        type="text"
        value={route.source ?? ''}
        placeholder={t('route.sourcePlaceholder')}
        oninput={(e) => edit('source', e.currentTarget.value)}
        onblur={() => commands.seal()}
      />
    </label>
    <div class="field color">
      <label for="route-color-{id}">{t('route.color')}</label>
      <span class="color-row">
        <input
          id="route-color-{id}"
          type="color"
          title={t('route.colorHint')}
          value={route.color ?? '#1971c2'}
          onchange={(e) => edit('color', e.currentTarget.value)}
        />
        {#if route.color}
          <button type="button" class="clear" title={t('route.stageColors')} aria-label={t('route.stageColors')} onclick={() => edit('color', undefined)}>×</button>
        {/if}
      </span>
    </div>
  </div>
  <label class="field">
    <span>{t('route.sourceUrl')}</span>
    <input type="url" value={route.sourceUrl ?? ''} placeholder="https://" oninput={(e) => edit('sourceUrl', e.currentTarget.value)} onblur={() => commands.seal()} />
  </label>
  {#if safeUrl(route.sourceUrl)}
    <p class="small"><a href={safeUrl(route.sourceUrl)} target="_blank" rel="noopener noreferrer">{route.sourceUrl}</a></p>
  {/if}
  <label class="field">
    <span>{t('route.notes')}</span>
    <textarea value={route.notes} oninput={(e) => edit('notes', e.currentTarget.value)} onblur={() => commands.seal()}></textarea>
  </label>
  <div class="actions">
    <button type="button" class="btn" title={t('route.duplicateHint')} onclick={duplicate}>{t('route.duplicate')}</button>
    <button type="button" class="btn" title={t('route.dissolveHint')} onclick={dissolve}>{t('route.dissolve')}</button>
    <button type="button" class="btn danger" onclick={remove}>{t('route.delete')}</button>
  </div>
{/if}

<style>
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

  .small {
    margin: -6px 0 10px;
    font-size: 12px;
    word-break: break-all;
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
