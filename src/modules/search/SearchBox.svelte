<script lang="ts">
  import { isCoarse } from '../../lib/ui/phone';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { LngLat } from '../../model/types';
  import { parseCoordinates, type Photon, type SearchResult } from '../../lib/photon';
  import { NOMINATIM_SEARCH, NominatimSearch } from '../../lib/nominatim';

  let {
    ctx,
    photon,
    choose,
    goTo,
    register,
  }: {
    ctx: ModuleContext;
    photon: Photon;
    choose: (r: SearchResult) => void;
    goTo: (p: LngLat) => void;
    register: (focus: () => void) => void;
  } = $props();
  const { t } = $derived(ctx);

  // No keyboard shortcut to mention on a touch screen.
  const touch = isCoarse();
  const DEBOUNCE_MS = 350;
  const MIN_CHARS = 3;
  const TIMEOUT_MS = 10_000;
  /** After Photon times out or fails, typing stops searching for this long; Enter still does. */
  const SLOW_PAUSE_MS = 120_000;
  const nominatim = new NominatimSearch();

  let input: HTMLInputElement;
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(0);
  let open = $state(false);
  let error = $state('');
  let hint = $state('');
  let searching = $state<'' | 'photon' | 'osm'>('');
  /** Where the results shown came from. */
  let source = $state<'photon' | 'osm'>('photon');
  let photonSlowUntil = 0;
  /** A last row under Photon's results to search OpenStreetMap instead. */
  const osmRow = $derived(NOMINATIM_SEARCH && source === 'photon' && results.length > 0);
  const lastIndex = $derived(results.length - (osmRow ? 0 : 1));
  /** The query read as coordinates, shown as a single result to jump to. */
  const coords = $derived(parseCoordinates(query));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;

  $effect(() => register(() => input.focus()));

  function onInput() {
    clearTimeout(timer);
    ctrl?.abort();
    searching = '';
    error = '';
    hint = '';
    const q = query.trim();
    if (parseCoordinates(q)) {
      results = [];
      open = true;
      return;
    }
    if (q.length < MIN_CHARS) {
      results = [];
      return;
    }
    if (Date.now() < photonSlowUntil) {
      results = [];
      hint = t('search.pressEnter');
      return;
    }
    timer = setTimeout(() => void run(q, false), DEBOUNCE_MS);
  }

  /** `asked` is true when Enter was pressed: only then may Nominatim be used. */
  async function run(q: string, asked: boolean) {
    clearTimeout(timer);
    ctrl?.abort();
    const mine = (ctrl = new AbortController());
    error = '';
    hint = '';
    if (asked && NOMINATIM_SEARCH && Date.now() < photonSlowUntil) return runOsm(q, mine);
    searching = 'photon';
    let timedOut = false;
    const limit = setTimeout(() => {
      timedOut = true;
      mine.abort();
    }, TIMEOUT_MS);
    try {
      const c = ctx.map.getCenter();
      const found = await photon.search(q, [c.lng, c.lat], mine.signal);
      if (mine !== ctrl) return;
      if (!found.length && asked && NOMINATIM_SEARCH) return runOsm(q, mine);
      show(found, 'photon');
    } catch (err) {
      if (mine !== ctrl) return;
      if ((err as Error).name === 'AbortError' && !timedOut) return;
      photonSlowUntil = Date.now() + SLOW_PAUSE_MS;
      if (asked && NOMINATIM_SEARCH) return runOsm(q, mine);
      searching = '';
      if (NOMINATIM_SEARCH) hint = t('search.slow');
      else error = t('search.failed');
    } finally {
      clearTimeout(limit);
    }
  }

  async function runOsm(q: string, mine: AbortController) {
    searching = 'osm';
    try {
      const found = await nominatim.search(q);
      if (mine === ctrl) show(found, 'osm');
    } catch {
      if (mine !== ctrl) return;
      searching = '';
      error = t('search.failed');
    }
  }

  function searchOsm(q: string) {
    clearTimeout(timer);
    ctrl?.abort();
    error = '';
    hint = '';
    void runOsm(q, (ctrl = new AbortController()));
  }

  function show(found: SearchResult[], from: 'photon' | 'osm') {
    searching = '';
    results = found;
    source = from;
    active = 0;
    open = true;
    if (!found.length) hint = from === 'photon' && NOMINATIM_SEARCH ? t('search.noResultsTryOsm') : t('search.noResults');
  }

  function pick(r: SearchResult) {
    open = false;
    input.blur();
    choose(r);
  }

  function jump(p: LngLat) {
    open = false;
    input.blur();
    goTo(p);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      active = Math.min(lastIndex, active + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(0, active - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (coords) jump(coords);
      else if (osmRow && active === results.length) searchOsm(query.trim());
      else if (results[active]) pick(results[active]!);
      else if (query.trim().length >= MIN_CHARS) void run(query.trim(), true);
    } else if (e.key === 'Escape') {
      open = false;
      input.blur();
    }
  }
</script>

<div class="search">
  <label class="box">
    <Icon d={icons.search} size={16} />
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      placeholder={touch ? t('search.placeholderTouch') : t('search.placeholder')}
      aria-label={t('search.placeholderTouch')}
      oninput={onInput}
      onkeydown={onKey}
      onfocus={() => (open = results.length > 0 || !!coords)}
      onblur={() => setTimeout(() => (open = false), 150)}
    />
  </label>
  {#if open && coords}
    <ul role="listbox">
      <li role="option" aria-selected="true">
        <button type="button" class="active" onmousedown={(e) => e.preventDefault()} onclick={() => jump(coords)}>
          <strong>{coords[1].toFixed(5)}, {coords[0].toFixed(5)}</strong>
          <span class="muted">{t('search.goToCoordinates')}</span>
        </button>
      </li>
    </ul>
  {:else if open && results.length}
    <ul role="listbox">
      {#each results as r, i (i)}
        <li role="option" aria-selected={i === active}>
          <button type="button" class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(r)}>
            <strong>{r.name}</strong>
            <span class="muted">{[r.kind, r.detail].filter(Boolean).join(' · ')}</span>
          </button>
        </li>
      {/each}
      {#if osmRow}
        <li role="option" aria-selected={active === results.length}>
          <button type="button" class="osm" class:active={active === results.length} onmousedown={(e) => e.preventDefault()} onclick={() => searchOsm(query.trim())}>
            <span>{t('search.tryOsm', { query: query.trim() })}</span>
          </button>
        </li>
      {/if}
      {#if source === 'osm'}<li class="source muted">{t('search.fromOsm')}</li>{/if}
    </ul>
  {/if}
  {#if searching}
    <p class="status muted" role="status">{searching === 'osm' ? t('search.searchingOsm') : t('search.searching')}</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if hint && !(open && results.length)}
    <p class="status muted" role="status">{hint}</p>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: min(360px, 100%);
  }

  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    color: var(--fg-muted);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 9px 0;
    border: 0;
    background: transparent;
    color: var(--fg);
    outline: none;
  }

  ul {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: max(100%, 260px);
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  li button {
    display: grid;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  li button span {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  li button.active,
  li button:hover {
    background: var(--bg-hover);
  }

  li button.osm {
    border-top: 1px solid var(--border);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    color: var(--fg-muted);
  }

  .source {
    padding: 4px 8px 2px;
    font-size: 11px;
  }

  .status,
  .error {
    margin: 4px 0 0;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    font-size: 12px;
  }

  .status {
    color: var(--fg-muted);
  }
</style>
