<script lang="ts">
  import type { Core } from '../core/core';
  import { createSettings } from '../core/settings';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';
  import SafeSection from '../lib/ui/SafeSection.svelte';

  let { core }: { core: Core } = $props();
  const { t, selection } = $derived(core);
  const store = $derived(core.store);
  const ids = $derived(core.selection.ids);
  const cards = $derived(core.ui.cards);
  const sections = $derived(core.ui.cardSections);
  const place = $derived(core.ui.place);
  const multiCards = $derived(core.ui.multiCards);
  const multi = $derived($ids.length > 1 && $multiCards.length > 0);

  // Size: drag the left edge for the width, the bottom edge for the height; double-click an edge
  // to go back to the default. Remembered in this browser.
  const prefs = createSettings('app');
  const DEFAULT_W = 300;
  const MIN_W = 260;
  const MAX_W = 720;
  const MIN_H = 160;
  let width = $state(prefs.get('cardWidth', DEFAULT_W));
  let height = $state<number | null>(prefs.get<number | null>('cardHeight', null));
  let resizing = $state(false);
  $effect(() => {
    document.documentElement.style.setProperty('--card-w', `${width}px`);
  });

  function startResize(e: PointerEvent, edge: 'left' | 'bottom') {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const card = handle.parentElement!;
    handle.setPointerCapture(e.pointerId);
    resizing = true;
    const rect = card.getBoundingClientRect();
    const maxH = card.parentElement!.clientHeight - rect.top - 16;
    const move = (ev: PointerEvent) => {
      if (edge === 'left') width = Math.round(Math.min(MAX_W, Math.max(MIN_W, rect.right - ev.clientX)));
      else height = Math.round(Math.min(maxH, Math.max(MIN_H, ev.clientY - rect.top)));
    };
    const up = () => {
      resizing = false;
      prefs.set('cardWidth', width);
      prefs.set('cardHeight', height);
      handle.removeEventListener('pointermove', move);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  function reset(edge: 'left' | 'bottom') {
    if (edge === 'left') width = DEFAULT_W;
    else height = null;
    prefs.set('cardWidth', width);
    prefs.set('cardHeight', height);
  }

  const target = $derived.by(() => {
    void $store;
    if ($ids.length !== 1) return null;
    const entity = store.get($ids[0]!);
    const renderer = entity && $cards.get(entity.type);
    return entity && renderer ? { id: entity.id, type: entity.type, renderer } : null;
  });
</script>

{#if target || multi || $place}
  <div class="card" class:resizing class:sized={height !== null} style:height={height !== null ? `${height}px` : null} role="dialog" aria-label="Details">
    <div
      class="edge left"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('card.resizeWidth')}
      title={t('card.resizeWidth')}
      onpointerdown={(e) => startResize(e, 'left')}
      ondblclick={() => reset('left')}
    ></div>
    <div
      class="edge bottom"
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('card.resizeHeight')}
      title={t('card.resizeHeight')}
      onpointerdown={(e) => startResize(e, 'bottom')}
      ondblclick={() => reset('bottom')}
    ></div>
    <div class="close">
      <IconButton
        icon={icons.close}
        label={t('card.close')}
        size={16}
        onclick={() => {
          selection.clear();
          core.ui.closePlace();
        }}
      />
    </div>
    <div class="body">
    {#if multi}
      {#each $multiCards as card (card.id)}
        <SafeSection message={t('app.partFailed')}><card.component ids={$ids} {...card.props} /></SafeSection>
      {/each}
    {:else if target}
      {#key target.id}
        <SafeSection message={t('app.partFailed')}><target.renderer.component id={target.id} {...target.renderer.props} /></SafeSection>
        {#each $sections.filter((s) => !s.types || s.types.includes(target.type)) as section (section.id)}
          <SafeSection message={t('app.partFailed')}><section.component id={target.id} {...section.props} /></SafeSection>
        {/each}
      {/key}
    {:else if $place}
      {@const Place = $place.component}
      {#key $place}
        <SafeSection message={t('app.partFailed')}><Place {...$place.props} /></SafeSection>
      {/key}
    {/if}
    </div>
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: var(--gap);
    right: var(--gap);
    display: flex;
    flex-direction: column;
    width: var(--card-w, 300px);
    max-height: calc(100% - 2 * var(--gap) - 120px);
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .card.sized {
    max-height: calc(100% - 2 * var(--gap));
  }

  .card.resizing {
    user-select: none;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
  }

  .edge {
    position: absolute;
    z-index: 2;
  }

  .edge.left {
    top: 0;
    bottom: 0;
    left: -3px;
    width: 8px;
    cursor: ew-resize;
  }

  .edge.bottom {
    left: 0;
    right: 0;
    bottom: -3px;
    height: 8px;
    cursor: ns-resize;
  }

  .edge.left:hover,
  .card.resizing .edge.left {
    background: linear-gradient(to right, transparent 2px, var(--accent) 2px, var(--accent) 5px, transparent 5px);
  }

  .edge.bottom:hover,
  .card.resizing .edge.bottom {
    background: linear-gradient(to top, transparent 2px, var(--accent) 2px, var(--accent) 5px, transparent 5px);
  }

  .close {
    position: absolute;
    z-index: 3;
    top: 6px;
    right: 6px;
  }

  @media (max-width: 640px) {
    .card {
      left: var(--gap);
      width: auto;
      max-height: 45vh;
    }

    .card.sized {
      height: auto !important;
    }

    .edge {
      display: none;
    }
  }
</style>
