<script lang="ts">
  import { POI_CATEGORIES, POI_CATEGORY_ORDER, POI_STATUS_ORDER } from '../../config/pois';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import PlaceInfo from '../../lib/places/PlaceInfo.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Poi, PoiCategory, PoiStatus } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const poi = $derived.by(() => {
    void $store;
    return store.get(id, 'poi');
  });

  let newLink = $state('');

  function patch(p: Partial<Poi>, field?: string) {
    commands.run({
      label: t('cmd.editPoi'),
      changes: [edits.update<Poi>(store, id, p)],
      ...(field ? { mergeKey: `poi:${id}:${field}` } : {}),
    });
  }

  function addLink(e: SubmitEvent) {
    e.preventDefault();
    const url = newLink.trim();
    if (!poi || !url) return;
    patch({ links: [...poi.links, /^https?:\/\//.test(url) ? url : `https://${url}`] });
    newLink = '';
  }

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
</script>

{#if poi}
  <label class="field">
    <span>{t('poi.name')}</span>
    <input type="text" value={poi.name} oninput={(e) => patch({ name: e.currentTarget.value }, 'name')} onblur={() => commands.seal()} />
  </label>

  <div class="field">
    <span>{t('poi.category')}</span>
    <div class="cats" role="radiogroup" aria-label={t('poi.category')}>
      {#each POI_CATEGORY_ORDER as cat (cat)}
        <button
          type="button"
          class="cat"
          class:active={poi.category === cat}
          style:--c={POI_CATEGORIES[cat].color}
          title={t(`poi.cat.${cat}`)}
          aria-label={t(`poi.cat.${cat}`)}
          onclick={() => patch({ category: cat as PoiCategory })}
        >
          <Icon d={POI_CATEGORIES[cat].icon} size={15} />
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span>{t('poi.status')}</span>
    <div class="status" role="radiogroup" aria-label={t('poi.status')}>
      {#each POI_STATUS_ORDER as s (s)}
        <button type="button" class:active={poi.status === s} onclick={() => patch({ status: s as PoiStatus })}>{t(`poi.status.${s}`)}</button>
      {/each}
    </div>
  </div>

  <label class="field">
    <span>{t('poi.notes')}</span>
    <textarea value={poi.notes} oninput={(e) => patch({ notes: e.currentTarget.value }, 'notes')} onblur={() => commands.seal()}></textarea>
  </label>

  <div class="field">
    <span>{t('poi.links')}</span>
    <ul class="linklist">
      {#each poi.links as link, i (link + i)}
        <li>
          <a href={link} target="_blank" rel="noopener noreferrer">{host(link)}</a>
          <IconButton icon={icons.close} label={t('poi.removeLink')} size={12} onclick={() => patch({ links: poi.links.filter((_, j) => j !== i) })} />
        </li>
      {/each}
    </ul>
    <form class="addlink" onsubmit={addLink}>
      <input type="url" placeholder={t('poi.addLink')} bind:value={newLink} />
    </form>
  </div>

  <PlaceInfo {ctx} lngLat={poi.lngLat} name={poi.name} osm={poi.osm} />

  <p class="hint muted">{t('poi.dragHint')}</p>
  <button type="button" class="danger" onclick={() => commands.run({ label: t('cmd.deletePoi'), changes: [edits.remove(store, id)] })}>
    {t('poi.delete')}
  </button>
{/if}

<style>
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .cat {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--c);
    border-radius: 50%;
    background: var(--bg);
    color: var(--c);
    cursor: pointer;
  }

  .cat.active {
    background: var(--c);
    color: #fff;
  }

  .status {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .status button {
    flex: 1;
    padding: 4px 2px;
    border: 0;
    background: var(--bg);
    font-size: 12px;
    cursor: pointer;
  }

  .status button + button {
    border-left: 1px solid var(--border);
  }

  .status button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .linklist {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
  }

  .linklist li {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .linklist a {
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .addlink input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .hint {
    font-size: 12px;
  }

  .danger {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    cursor: pointer;
  }
</style>
