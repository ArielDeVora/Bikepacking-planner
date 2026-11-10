<script lang="ts">
  import { onMount } from 'svelte';
  import { CATEGORY_ICON_KEYS, POI_ICONS } from '../../config/pois';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { authorOf } from '../../lib/places/authors';
  import { categoryInfo, categoryPlaces, deleteCategoryCommand, takeJustCreated } from '../../lib/places/categories';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { PoiFolder } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const members = $derived(ctx.cloud.members);

  const category = $derived.by(() => {
    void $store;
    return store.get(id, 'poiFolder');
  });
  const info = $derived.by(() => {
    void $store;
    return categoryInfo(store, t, id);
  });
  const count = $derived.by(() => {
    void $store;
    return categoryPlaces(store, id).length;
  });
  const maker = $derived.by(() => {
    void $members;
    return category?.createdBy ? authorOf(ctx.cloud, t, category.createdBy) : null;
  });

  let nameInput = $state<HTMLInputElement>();
  onMount(() => {
    if (!takeJustCreated(id)) return;
    nameInput?.focus();
    nameInput?.select();
  });

  function edit(patch: Partial<PoiFolder>, field: string) {
    commands.run({ label: t('cmd.editCategory'), changes: [edits.update<PoiFolder>(store, id, patch)], mergeKey: `poiFolder:${id}:${field}` });
  }

  function remove() {
    commands.run(deleteCategoryCommand(store, id, t('cmd.deleteCategory')));
    selection.clear();
  }
</script>

{#if category}
  <div class="title">
    <span class="badge" style:background={info.color}><Icon d={info.icon} size={16} /></span>
    <span class="muted small">
      {count === 1 ? t('category.countOne') : t('category.count', { n: count })}{#if maker}{' · '}{t('category.madeBy', { name: maker.name })}{/if}
    </span>
  </div>

  <div class="row">
    <label class="field">
      <span>{t('category.name')}</span>
      <input
        bind:this={nameInput}
        type="text"
        value={category.name}
        oninput={(e) => edit({ name: e.currentTarget.value }, 'name')}
        onblur={() => commands.seal()}
      />
    </label>
    <div class="field color">
      <label for="category-color-{id}">{t('category.color')}</label>
      <input id="category-color-{id}" type="color" value={info.color} onchange={(e) => edit({ color: e.currentTarget.value }, 'color')} />
    </div>
  </div>

  <div class="field">
    <span>{t('category.icon')}</span>
    <div class="icons" role="radiogroup" aria-label={t('category.icon')} style:--c={info.color}>
      {#each CATEGORY_ICON_KEYS as key (key)}
        <button
          type="button"
          class="icon"
          class:active={info.iconKey === key}
          role="radio"
          aria-checked={info.iconKey === key}
          title={key}
          aria-label={key}
          onclick={() => edit({ icon: key }, 'icon')}
        >
          <Icon d={POI_ICONS[key]} size={15} />
        </button>
      {/each}
    </div>
  </div>

  <div class="actions">
    <button type="button" class="btn danger" title={t('category.deleteHint')} onclick={remove}>{t('category.delete')}</button>
    <span class="muted small">{t('category.deleteHint')}</span>
  </div>
{/if}

<style>
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 28px 10px 0;
  }

  .badge {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: #fff;
  }

  .small {
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

  .color input {
    width: 44px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
    gap: 4px;
  }

  .icon {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    padding: 0;
    border: 1.5px solid var(--border);
    border-radius: 50%;
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }

  .icon:hover {
    border-color: var(--c);
    color: var(--c);
  }

  .icon.active {
    border-color: var(--c);
    background: var(--c);
    color: #fff;
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0 0;
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
