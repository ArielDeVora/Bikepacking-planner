<script lang="ts">
  import { matchesQuery } from '../../lib/text';
  import { untrack, type Snippet } from 'svelte';
  import { POI_STATUS_ORDER } from '../../config/pois';
  import type { ModuleContext } from '../../core/module';
  import { loadCountries, type CountryIndex } from '../../lib/countries';
  import { icons } from '../../lib/icons';
  import { authorOf, distinctAuthors, type Author } from '../../lib/places/authors';
  import {
    allCategories,
    categoryInfo,
    categoryVisibilityId,
    comparePlaces,
    createCategoryCommand,
    customCategories,
    deleteCategoryCommand,
    moveCategoryCommand,
    movePlacesCommand,
    resolveCategory,
    type CategoryInfo,
  } from '../../lib/places/categories';
  import { approvals, CROWN_APPROVALS, tally, votesByPlace, VOTES, type Tally } from '../../lib/places/votes';
  import Icon from '../../lib/ui/Icon.svelte';
  import CategoriesDialog from './CategoriesDialog.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Poi, PoiStatus } from '../../model/types';

  let { ctx, focus, focusCategory }: { ctx: ModuleContext; focus: (id: string) => void; focusCategory: (id: string) => void } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);
  const members = $derived(ctx.cloud.members);
  const profile = $derived(ctx.cloud.profile);
  const shared = $derived(ctx.cloud.shared);
  const hidden = $derived(ctx.visibility.hidden);

  const LIMIT = 200;
  let status = $state<PoiStatus | 'all'>('all');
  let author = $state<string>('all');
  let byCountry = $state(untrack(() => ctx.settings.get('byCountry', false)));

  // Collapsed categories and countries, remembered in this browser.
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
    category: CategoryInfo;
    author: Author;
    votes: Tally;
    /** People who approve of it (I'm in or GOATED). */
    approvals: number;
  }

  // Every category: built-in ones first, then custom ones (each is a folder in the list).
  const categories = $derived.by(() => {
    void $store;
    return allCategories(store, t);
  });

  const all = $derived.by((): Item[] => {
    void $store;
    void $members;
    void $profile;
    const votes = votesByPlace(store);
    // A place's stored category may be a replaced built-in one or a deleted one: use what it shows as.
    const byId = new Map(categories.map((c) => [c.id, c]));
    const infoOf = (id: string) => {
      const resolved = resolveCategory(store, id);
      return byId.get(resolved) ?? categoryInfo(store, t, resolved);
    };
    return store.list('poi').map((poi) => ({
      poi,
      category: infoOf(poi.category),
      author: authorOf(ctx.cloud, t, poi.createdBy, poi.suggestedBy),
      votes: tally(votes.get(poi.id) ?? []),
      approvals: approvals(votes.get(poi.id) ?? []),
    }));
  });
  const authors = $derived(distinctAuthors(all.map((x) => x.author)));
  const showAuthors = $derived($shared || authors.length > 1);
  // A filter on someone who no longer has places falls back to everyone.
  const authorFilter = $derived(authors.some((a) => a.key === author) ? author : 'all');
  const query = $derived(ctx.ui.panelQuery);
  const searching = $derived(!!$query.trim());
  const filtering = $derived(status !== 'all' || authorFilter !== 'all' || searching);

  const items = $derived(
    all
      .filter(
        (x) =>
          (status === 'all' || x.poi.status === status) &&
          (authorFilter === 'all' || x.author.key === authorFilter) &&
          (!searching || matchesQuery($query, x.poi.name, x.category.name, x.poi.notes)),
      )
      .sort((a, b) => a.poi.name.localeCompare(b.poi.name)),
  );

  // Folders: built-in categories that have places, and every custom category (unless filtering hides it).
  const folders = $derived.by(() => {
    const byCategory = new Map<string, Item[]>(categories.map((c) => [c.id, []]));
    for (const item of items.slice(0, LIMIT)) byCategory.get(item.category.id)?.push(item);
    for (const list of byCategory.values()) list.sort((a, b) => comparePlaces(a.poi, b.poi));
    return categories
      .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }))
      .filter((f) => f.items.length || (f.category.custom && !filtering));
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

  /** A new custom category; its card opens to name it and choose its icon. */
  function newCategory() {
    const { command, id } = createCategoryCommand(store, {
      tripId: ctx.tripId,
      userId: ctx.user.id,
      name: t('category.defaultName', { n: customCategories(store).length + 1 }),
      label: t('cmd.addCategory'),
    });
    commands.run(command);
    selection.set([id]);
  }

  function deleteCategory(id: string) {
    commands.run(deleteCategoryCommand(store, id, t('cmd.deleteCategory')));
    if (selection.current.includes(id)) selection.clear();
  }

  // Dragging places, like segments in the trip tree: before or after another place (a line shows
  // where), or onto a category's row (at the end of its folder). A selected place takes the other
  // selected places with it.
  type Where = 'before' | 'after' | 'into';
  let dragging = $state<string[] | null>(null);
  let dropTarget = $state<{ id: string; where: Where } | null>(null);

  function dragStart(e: DragEvent, poi: Poi) {
    const sel = selection.current.filter((id) => store.get(id, 'poi'));
    dragging = sel.includes(poi.id) ? sel : [poi.id];
    e.dataTransfer?.setData('text/plain', poi.name);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(e: DragEvent, id: string, onPlace: boolean) {
    if (!dragging || dragging.includes(id)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropTarget = { id, where: onPlace ? (e.clientY - r.top < r.height / 2 ? 'before' : 'after') : 'into' };
  }

  // Categories are dragged by their row, to change the order of the folders.
  let draggingCategory = $state<string | null>(null);

  function categoryDragStart(e: DragEvent, id: string) {
    draggingCategory = id;
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function categoryDragOver(e: DragEvent, id: string) {
    if (!draggingCategory) return dragOver(e, id, false);
    if (draggingCategory === id) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropTarget = { id, where: e.clientY - r.top < r.height / 2 ? 'before' : 'after' };
  }

  function categoryDrop(e: DragEvent, id: string) {
    if (!draggingCategory) return drop(e, id);
    e.preventDefault();
    e.stopPropagation();
    const moved = draggingCategory;
    const to = dropTarget;
    endDrag();
    if (!to || to.where === 'into') return;
    const cmd = moveCategoryCommand(store, t, moved, { id: to.id, where: to.where }, t('cmd.moveCategory'));
    if (cmd) commands.run(cmd);
  }

  function dragLeave(id: string) {
    if (dropTarget?.id === id) dropTarget = null;
  }

  function drop(e: DragEvent, categoryId: string) {
    e.preventDefault();
    e.stopPropagation();
    const ids = dragging;
    const to = dropTarget;
    endDrag();
    if (!ids || !to) return;
    const nextTo = to.where === 'into' ? null : { id: to.id, where: to.where };
    const cmd = movePlacesCommand(store, ids, categoryId, nextTo, t('cmd.movePlaces'));
    if (cmd) commands.run(cmd);
  }

  const dropClass = (id: string) => (dropTarget?.id === id ? `drop-${dropTarget.where}` : '');

  function endDrag() {
    dragging = null;
    draggingCategory = null;
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
  <IconButton icon={icons.tag} label={t('category.manage')} size={16} onclick={() => ctx.ui.openDialog(CategoriesDialog, { ctx })} />
  <IconButton icon={icons.folderPlus} label={t('category.new')} size={16} onclick={newCategory} />
</div>
<p class="muted small hint">{t('poi.addHint')}</p>

{#snippet placeRow(item: Item)}
  {@const poi = item.poi}
  <li
    class="place {byCountry ? '' : dropClass(poi.id)}"
    class:selected={$selected.includes(poi.id)}
    class:dragged={dragging?.includes(poi.id)}
    draggable={!byCountry}
    title={!byCountry ? t('category.dragHint') : undefined}
    ondragstart={(e) => dragStart(e, poi)}
    ondragover={byCountry ? undefined : (e) => dragOver(e, poi.id, true)}
    ondragleave={byCountry ? undefined : () => dragLeave(poi.id)}
    ondrop={byCountry ? undefined : (e) => drop(e, item.category.id)}
    ondragend={endDrag}
  >
    <button type="button" onclick={() => focus(poi.id)}>
      <span class="icon" style:background={item.category.color}><Icon d={item.category.icon} size={11} /></span>
      <span class="label">
        {#if item.approvals >= CROWN_APPROVALS}<span class="crown" title={t('vote.crowned', { n: item.approvals })}>👑</span>{/if}
        {poi.name || t('poi.untitled')}
      </span>
      {#if poi.status !== 'idea'}<span class="tag {poi.status}">{t(`poi.status.${poi.status}`)}</span>{/if}
      {#if item.votes.counts[2] || item.votes.counts[1] || item.votes.counts[-1]}
        <span class="votes" title={t('vote.summary', { n: item.votes.counts[2] + item.votes.counts[1] + item.votes.counts[-1], score: item.votes.score })}>
          {#each VOTES as o (o.value)}
            {#if item.votes.counts[o.value]}<span>{o.emoji}{item.votes.counts[o.value]}</span>{/if}
          {/each}
        </span>
      {/if}
      {#if showAuthors}
        <span class="author" style:background={item.author.color} title={t('poi.addedBy', { name: item.author.name })}></span>
      {/if}
    </button>
  </li>
{/snippet}

<!-- A collapsible row in the style of the trip tree's groups, with its places below. -->
{#snippet groupRow(key: string, label: string, list: Item[], icon: Snippet, category?: CategoryInfo)}
  {@const closed = !searching && collapsed.has(key)}
  {@const visibilityId = category ? categoryVisibilityId(category.id) : ''}
  {@const off = !!category && $hidden.has(visibilityId)}
  <li>
    <div
      class="row"
      class:selected={!!category?.custom && $selected.includes(category.id)}
      class:hidden={off}
      class:drop-into={!!category && dropTarget?.id === key && dropTarget.where === 'into'}
      class:drop-before={!!category && dropTarget?.id === key && dropTarget.where === 'before'}
      class:drop-after={!!category && dropTarget?.id === key && dropTarget.where === 'after'}
      class:dragged={!!category && draggingCategory === category.id}
      draggable={!!category && !byCountry}
      title={category && !byCountry ? t('category.dragRow') : undefined}
      ondragstart={category && !byCountry ? (e) => categoryDragStart(e, category.id) : undefined}
      ondragend={category ? endDrag : undefined}
      role="treeitem"
      aria-selected={!!category?.custom && $selected.includes(category.id)}
      aria-expanded={!closed}
      tabindex="-1"
      ondragover={category ? (e) => categoryDragOver(e, key) : undefined}
      ondragleave={category ? () => dragLeave(key) : undefined}
      ondrop={category ? (e) => categoryDrop(e, category.id) : undefined}
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
      <button type="button" class="name" onclick={() => (category ? focusCategory(category.id) : toggle(key))}>
        {@render icon()}
        <span class="label">{label}</span>
        <span class="count muted">{list.length}</span>
      </button>
      {#if category}
        <button
          type="button"
          class="eye"
          class:off
          title={off ? t('tree.show') : t('tree.hide')}
          aria-label={off ? t('tree.show') : t('tree.hide')}
          aria-pressed={!off}
          onclick={() => ctx.visibility.toggle(visibilityId)}
        >
          <Icon d={off ? icons.eyeOff : icons.eye} size={14} />
        </button>
        <span class="actions">
          {#if category.custom}
            {@const id = category.id}
            <IconButton icon={icons.trash} label={`${t('category.delete')}. ${t('category.deleteHint')}`} size={14} onclick={() => deleteCategory(id)} />
          {:else}
            {@const id = category.id}
            <IconButton icon={icons.trash} label={t('category.remove')} size={14} onclick={() => ctx.ui.openDialog(CategoriesDialog, { ctx, focusOn: id })} />
          {/if}
        </span>
      {/if}
    </div>
    {#if !closed}
      {#if list.length}
        <ul class="children">
          {#each list as item (item.poi.id)}{@render placeRow(item)}{/each}
        </ul>
      {:else if category?.custom}
        <p class="muted small empty">{t('category.empty')}</p>
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
            {@render groupRow(g.key, g.name, g.items, flagIcon)}
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
    {:else}
      <ul>
        {#each folders as f (f.category.id)}
          {#snippet categoryIcon()}<span class="badge" style:background={f.category.color}><Icon d={f.category.icon} size={11} /></span>{/snippet}
          {@render groupRow(f.category.id, f.category.name, f.items, categoryIcon, f.category)}
        {/each}
      </ul>
    {/if}
  </div>
  {#if items.length > LIMIT}
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

  .head :global(.icon-btn) {
    width: 28px;
    height: 28px;
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

  .row.drop-before {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .row.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .row.dragged {
    opacity: 0.45;
  }

  .row[draggable='true'] {
    cursor: grab;
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

  .badge {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
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

  .place.drop-before button {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .place.drop-after button {
    box-shadow: inset 0 -2px 0 var(--accent);
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

  .tag.goated {
    background: linear-gradient(90deg, #fcc419, #f59f00);
    color: #3b2700;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .votes {
    display: inline-flex;
    flex: none;
    gap: 4px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--fg-muted);
  }

  .tag.skip {
    color: var(--fg-muted);
  }

  .crown {
    margin-right: 3px;
    font-size: 12px;
  }

  .author {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px var(--bg);
  }
</style>
