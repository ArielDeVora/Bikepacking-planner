<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { LngLat } from '../../model/types';
  import { parseCoordinates, type Photon, type SearchResult } from '../../lib/photon';

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

  const DEBOUNCE_MS = 350;
  const MIN_CHARS = 3;

  let input: HTMLInputElement;
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(0);
  let open = $state(false);
  let error = $state('');
  /** The query read as coordinates, shown as a single result to jump to. */
  const coords = $derived(parseCoordinates(query));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;

  $effect(() => register(() => input.focus()));

  function onInput() {
    clearTimeout(timer);
    error = '';
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
    timer = setTimeout(() => void run(q), DEBOUNCE_MS);
  }

  async function run(q: string) {
    ctrl?.abort();
    ctrl = new AbortController();
    try {
      const c = ctx.map.getCenter();
      results = await photon.search(q, [c.lng, c.lat], ctrl.signal);
      active = 0;
      open = true;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') error = t('search.failed');
    }
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
      active = Math.min(results.length - 1, active + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(0, active - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (coords) jump(coords);
      else if (results[active]) pick(results[active]!);
      else if (query.trim().length >= MIN_CHARS) void run(query.trim());
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
      placeholder={t('search.placeholder')}
      aria-label={t('search.placeholder')}
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
    </ul>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
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

  .error {
    margin: 4px 0 0;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    font-size: 12px;
  }
</style>
