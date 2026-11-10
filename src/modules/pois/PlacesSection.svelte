<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { POI_CATEGORIES, POI_STATUS_ORDER } from '../../config/pois';
  import type { ModuleContext } from '../../core/module';
  import { loadCountries, type CountryIndex } from '../../lib/countries';
  import { icons } from '../../lib/icons';
  import { authorOf, distinctAuthors, type Author } from '../../lib/places/authors';
  import { createFolderCommand, deleteFolderCommand, moveToFolderCommand, sortedFolders } from '../../lib/places/folders';
  import Icon from '../../lib/ui/Icon.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Poi, PoiFolder, PoiStatus } from '../../model/types';

  let { ctx, focus, focusFolder }: { ctx: ModuleContext; focus: (id: string) => void; focusFolder: (id: string) => void } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);
  const members = $derived(ctx.cloud.members);
  const profile = $derived(ctx.cloud.profile);
  const shared = $derived(ctx.cloud.shared);
  const hidden = $derived(ctx.visibility.hidden);

  const LIMIT = 200;
  const LOOSE = '__loose';
  let status = $state<PoiStatus | 'all'>('all');
  let author = $state<string>('all');
  let byCountry = $state(untrack(() => ctx.settings.get('byCountry', false)));

  // Collapsed folders and countries, remembered in this browser.
  let collapsed = $state(new Set<string>(untrack(() => ctx.settings.get<string[]>('collapsed', []))));
  function toggle(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsed = next;
    ctx.settings.set('collapsed', [...next]);
  }

  interface Item {
    poi: Poi;
    author: Author;
  }

  const all = $derived.by((): Item[] => {
    void $store;
    void $members;
    void $profile;
    return store.list('poi').map((poi) => ({ poi, author: authorOf(ctx.cloud, t, poi.createdBy) }));
  });
  const authors = $derived(distinctAuthors(all.map((x) => x.author)));
  const showAuthors = $derived($shared || authors.length > 1);
  // A filter on someone who no longer has places falls back to everyone.
  const authorFilter = $derived(authors.some((a) => a.key === author) ? author : 'all');
  const filtering = $derived(status !== 'all' || authorFilter !== 'all');

  const items = $derived(
    all
      .filter((x) => (status === 'all' || x.poi.status === status) && (authorFilter === 'all' || x.author.key === authorFilter))
      .sort((a, b) => a.poi.name.localeCompare(b.poi.name)),
  );

  // Folders: each with its places (after filtering); places of a deleted folder are loose.
  const folders = $derived.by(() => {
    void $store;
    return sortedFolders(store);
  });
  const filed = $derived.by(() => {
    const ids = new Set(folders.map((f) => f.id));
    const byFolder = new Map<string, Item[]>(folders.map((f) => [f.id, []]));
    const loose: Item[] = [];
    for (const item of items) {
      const id = item.poi.folderId;
      if (id && ids.has(id)) byFolder.get(id)!.push(item);
      else loose.push(item);
    }
    return { byFolder, loose };
  });

  // Countries: outlines are loaded on demand (shared with the borders module), and each place's
  // country is remembered until it moves.
  let countries = $state<CountryIndex | null>(null);
  let countriesFailed = $state(false);
  $effect(() => {
    if (!byCountry || countries) return;
    countriesFailed = false;
    loadCountries()
      .then((index) => (countries = index))
      .catch(() => (countriesFailed = true));
  });
  const countryCache = new Map<string, { at: string; code: string; name: string }>();
  function countryOf(poi: Poi, index: CountryIndex) {
    const at = poi.lngLat.join(',');
    const hit = countryCache.get(poi.id);
    if (hit?.at === at) return hit;
    const c = index.at(poi.lngLat);
    const value = { at, code: c?.code ?? '', name: c?.name ?? '' };
    countryCache.set(poi.id, value);
    return value;
  }

  interface CountryGroup {
    key: string;
    name: string;
    flag: string;
    items: Item[];
  }
  const countryGroups = $derived.by((): CountryGroup[] | null => {
    if (!byCountry || !countries) return null;
    const byKey = new Map<string, CountryGroup>();
    for (const item of items.slice(0, LIMIT)) {
      const c = countryOf(item.poi, countries);
      const key = `country:${c.name}`;
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { key, name: c.name || t('poi.noCountry'), flag: flag(c.code), items: [] }));
      g.items.push(item);
    }
    const unknown = 'country:';
    return [...byKey.values()].sort((a, b) => (a.key === unknown ? 1 : b.key === unknown ? -1 : a.name.localeCompare(b.name)));
  });

  /** Flag emoji for a two-letter country code. */
  function flag(code: string): string {
    return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';
  }

  function setByCountry(on: boolean) {
    byCountry = on;
    ctx.settings.set('byCountry', on);
  }

  function newFolder() {
    const { command, id } = createFolderCommand(store, {
      tripId: ctx.tripId,
      name: t('folder.defaultName', { n: folders.length + 1 }),
      label: t('cmd.addFolder'),
    });
    commands.run(command);
    selection.set([id]);
  }

  function deleteFolder(folder: PoiFolder) {
    commands.run(deleteFolderCommand(store, folder.id, t('cmd.deleteFolder')));
    if (selection.current.includes(folder.id)) selection.clear();
  }

  // Dragging places onto a folder (or onto "Not in a folder"). A selected place takes the other
  // selected places with it.
  const DRAG_TYPE = 'application/x-bikepacking-places';
  let dragging = $state<string[] | null>(null);
  let dropTarget = $state<string | null>(null);

  function dragStart(e: DragEvent, poi: Poi) {
    const sel = selection.current.filter((id) => store.get(id, 'poi'));
    dragging = sel.includes(poi.id) ? sel : [poi.id];
    e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(dragging));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(e: DragEvent, key: string) {
    if (!dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget = key;
  }

  function drop(e: DragEvent, key: string) {
    e.preventDefault();
    const ids = dragging;
    endDrag();
    if (!ids) return;
    const cmd = moveToFolderCommand(store, ids, key === LOOSE ? null : key, t('cmd.moveToFolder'));
    if (cmd) commands.run(cmd);
  }

  function endDrag() {
    dragging = null;
    dropTarget = null;
  }
</script>

<div class="head">
  <select bind:value={status} aria-label={t('poi.status')}>
    <option value="all">{t('poi.all')}</option>
    {#each POI_STATUS_ORDER as s (s)}
      <option value={s}>{t(`poi.status.${s}`)}</option>
    {/each}
  </select>
  {#if showAuthors}
    <select value={authorFilter} onchange={(e) => (author = e.currentTarget.value)} aria-label={t('poi.anyone')}>
      <option value="all">{t('poi.anyone')}</option>
      {#each authors as a (a.key)}
        <option value={a.key}>{a.name}</option>
      {/each}
    </select>
  {/if}
  <label class="check">
    <input type="checkbox" checked={byCountry} onchange={(e) => setByCountry(e.currentTarget.checked)} />
    {t('poi.byCountry')}
  </label>
  <span class="spacer"></span>
  <IconButton icon={icons.folderPlus} label={t('folder.new')} size={16} onclick={newFolder} />
</div>
<p class="muted small hint">{t('poi.addHint')}</p>

{#snippet placeRow(item: Item)}
  {@const poi = item.poi}
  <li
    class="place"
    class:selected={$selected.includes(poi.id)}
    class:dragged={dragging?.includes(poi.id)}
    draggable={folders.length > 0 && !byCountry}
    title={folders.length > 0 && !byCountry ? t('folder.dragHint') : undefined}
    ondragstart={(e) => dragStart(e, poi)}
    ondragend={endDrag}
  >
    <button type="button" onclick={() => focus(poi.id)}>
      <span class="icon" style:background={POI_CATEGORIES[poi.category].color}><Icon d={POI_CATEGORIES[poi.category].icon} size={11} /></span>
      <span class="label">{poi.name || t('poi.untitled')}</span>
      {#if poi.status !== 'idea'}<span class="tag {poi.status}">{t(`poi.status.${poi.status}`)}</span>{/if}
      {#if showAuthors}
        <span class="author" style:background={item.author.color} title={t('poi.addedBy', { name: item.author.name })}></span>
      {/if}
    </button>
  </li>
{/snippet}

<!-- A collapsible row in the style of the trip tree's groups, with its places below. -->
{#snippet groupRow(
  key: string,
  label: string,
  list: Item[],
  icon: Snippet,
  opts: { folder?: PoiFolder; drop?: boolean; empty?: string },
)}
  {@const closed = collapsed.has(key)}
  {@const off = !!opts.folder && $hidden.has(opts.folder.id)}
  <li>
    <div
      class="row"
      class:selected={!!opts.folder && $selected.includes(opts.folder.id)}
      class:hidden={off}
      class:drop-into={opts.drop && dropTarget === key}
      role="treeitem"
      aria-selected={!!opts.folder && $selected.includes(opts.folder.id)}
      aria-expanded={!closed}
      tabindex="-1"
      ondragover={opts.drop ? (e) => dragOver(e, key) : undefined}
      ondragleave={opts.drop ? () => dropTarget === key && (dropTarget = null) : undefined}
      ondrop={opts.drop ? (e) => drop(e, key) : undefined}
    >
      <button
        type="button"
        class="chevron"
        class:closed
        disabled={!list.length}
        aria-label={closed ? t('tree.expand') : t('tree.collapse')}
        title={closed ? t('tree.expand') : t('tree.collapse')}
        onclick={() => toggle(key)}
      >
        <Icon d={icons.down} size={12} />
      </button>
      <button type="button" class="name" onclick={() => (opts.folder ? focusFolder(opts.folder.id) : toggle(key))}>
        {@render icon()}
        <span class="label">{label}</span>
        <span class="count muted">{list.length}</span>
      </button>
      {#if opts.folder}
        {@const folder = opts.folder}
        <button
          type="button"
          class="eye"
          class:off
          title={off ? t('tree.show') : t('tree.hide')}
          aria-label={off ? t('tree.show') : t('tree.hide')}
          aria-pressed={!off}
          onclick={() => ctx.visibility.toggle(folder.id)}
        >
          <Icon d={off ? icons.eyeOff : icons.eye} size={14} />
        </button>
        <span class="actions">
          <IconButton icon={icons.trash} label={`${t('folder.delete')}. ${t('folder.deleteHint')}`} size={14} onclick={() => deleteFolder(folder)} />
        </span>
      {/if}
    </div>
    {#if !closed}
      {#if list.length}
        <ul class="children">
          {#each list as item (item.poi.id)}{@render placeRow(item)}{/each}
        </ul>
      {:else if opts.empty}
        <p class="muted small empty">{opts.empty}</p>
      {/if}
    {/if}
  </li>
{/snippet}

{#if items.length || folders.length}
  <div class="list">
    {#if byCountry}
      {#if countryGroups}
        <ul>
          {#each countryGroups as g (g.key)}
            {#snippet flagIcon()}<span class="flag">{g.flag || '🏳️'}</span>{/snippet}
            {@render groupRow(g.key, g.name, g.items, flagIcon, {})}
          {/each}
        </ul>
      {:else if countriesFailed}
        <p class="muted small">{t('poi.countriesFailed')}</p>
        <ul>
          {#each items.slice(0, LIMIT) as item (item.poi.id)}{@render placeRow(item)}{/each}
        </ul>
      {:else}
        <p class="muted small">{t('poi.loadingCountries')}</p>
      {/if}
    {:else if folders.length}
      <ul>
        {#each folders as folder (folder.id)}
          {@const list = filed.byFolder.get(folder.id) ?? []}
          {#if list.length || !filtering}
            {#snippet folderIcon()}<span class="folder" style:color={folder.color ?? 'var(--accent)'}><Icon d={icons.folder} size={14} /></span>{/snippet}
            {@render groupRow(folder.id, folder.name || t('poi.untitled'), list, folderIcon, { folder, drop: true, empty: t('folder.empty') })}
          {/if}
        {/each}
        {#if filed.loose.length || dragging}
          {#snippet looseIcon()}<span class="folder muted"><Icon d={icons.pin} size={14} /></span>{/snippet}
          {@render groupRow(LOOSE, t('folder.loose'), filed.loose.slice(0, LIMIT), looseIcon, { drop: true })}
        {/if}
      </ul>
    {:else}
      <ul>
        {#each items.slice(0, LIMIT) as item (item.poi.id)}{@render placeRow(item)}{/each}
      </ul>
    {/if}
  </div>
  {#if items.length > LIMIT && (byCountry || !folders.length || filed.loose.length > LIMIT)}
    <p class="muted small">{t('poi.more', { n: items.length - LIMIT })}</p>
  {/if}
{:else}
  <p class="muted small">{t('poi.empty')}</p>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .head select {
    width: auto;
    min-width: 0;
    max-width: 140px;
    padding: 3px 6px;
  }

  .spacer {
    flex: 1;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }

  .hint {
    margin: 4px 0 6px;
  }

  .small {
    font-size: 12px;
  }

  .list {
    max-height: 360px;
    overflow-y: auto;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Folder and country rows: the trip tree's group rows. */
  .row {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.selected {
    background: var(--accent-soft);
  }

  .row.drop-into {
    background: var(--accent-soft);
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .row.hidden > .name {
    opacity: 0.45;
  }

  .chevron {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: transform 0.12s ease;
  }

  .chevron.closed {
    transform: rotate(-90deg);
  }

  .chevron:disabled {
    visibility: hidden;
  }

  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 4px;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }

  .folder {
    display: grid;
    flex: none;
  }

  .flag {
    flex: none;
    width: 14px;
    font-size: 13px;
    line-height: 1;
    text-align: center;
  }

  .count {
    flex: none;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .eye {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .eye:hover {
    background: var(--bg-hover);
    color: var(--fg);
  }

  .eye.off {
    color: var(--accent);
  }

  .actions {
    display: flex;
    opacity: 0;
  }

  .row:hover .actions,
  .row:focus-within .actions,
  .row.selected .actions {
    opacity: 1;
  }

  .actions :global(.icon-btn) {
    width: 26px;
    height: 26px;
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }
  }

  .children {
    margin: 0 0 4px 14px;
  }

  .empty {
    margin: 2px 0 6px 40px;
  }

  /* Place rows. */
  .place button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .place button:hover {
    background: var(--bg-hover);
  }

  .place.selected button {
    background: var(--accent-soft);
  }

  .place[draggable='true'] button {
    cursor: grab;
  }

  .place.dragged {
    opacity: 0.45;
  }

  .children .place button {
    font-size: 13px;
  }

  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--bg-sunken);
    font-size: 11px;
  }

  .tag.mustSee {
    color: #b45309;
  }

  .tag.booked {
    color: #2f9e44;
  }

  .tag.skip {
    color: var(--fg-muted);
  }

  .author {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px var(--bg);
  }
</style>
