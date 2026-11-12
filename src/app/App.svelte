<script lang="ts">
  import { untrack } from 'svelte';
  import type { Core } from '../core/core';
  import { KEYS } from '../config/shortcuts';
  import { createSettings } from '../core/settings';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';
  import { phone } from '../lib/ui/phone';
  import { createSheet } from '../lib/ui/sheet';
  import SafeSection from '../lib/ui/SafeSection.svelte';
  import Cheatsheet from './Cheatsheet.svelte';
  import InfoCard from './InfoCard.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import { startOnboarding, watchForUpdates } from './onboarding';
  import { watchCommands } from './undo-notice';
  import Toasts from './Toasts.svelte';
  import Toolbar from './Toolbar.svelte';

  let { core }: { core: Core } = $props();
  const { t } = $derived(core);
  const panelQuery = untrack(() => core.ui.panelQuery);
  const appPrefs = $derived(core.prefs);
  let searchEl = $state<HTMLInputElement>();
  $effect(() =>
    core.shortcuts.add({
      keys: KEYS.panelSearch,
      label: t('panel.search'),
      run: () => {
        if (!panelOpen) togglePanel();
        requestAnimationFrame(() => searchEl?.focus());
      },
    }),
  );
  const sections = $derived(core.ui.panelSections);
  const widgets = $derived(core.ui.widgets);
  const drawers = $derived(core.ui.drawers);
  let bottomHeight = $state(0);
  let topHeight = $state(0);
  $effect(() => {
    document.documentElement.style.setProperty('--top-h', `${topHeight}px`);
  });
  const dialog = $derived(core.ui.dialog);

  function onKeydown(e: KeyboardEvent) {
    if ($dialog && e.key === 'Escape') {
      e.stopPropagation();
      core.ui.closeDialog();
    } else if (activeView && e.key === 'Escape' && !(e.target as HTMLElement).closest?.('input, select, textarea')) {
      e.stopPropagation();
      closeView();
    }
  }
  const theme = $derived(core.theme);
  const status = $derived(core.status);

  $effect(() => core.shortcuts.add({ global: true, keys: KEYS.help, label: t('help.open'), run: () => core.ui.openDialog(Cheatsheet, { core }) }));
  const openSettings = () => core.ui.openDialog(SettingsDialog, { core });
  $effect(() => core.shortcuts.add({ global: true, keys: KEYS.settings, label: t('settings.title'), run: openSettings }));

  let onboarded = false;
  $effect(() => {
    if ($status !== 'ready' || onboarded) return;
    onboarded = true;
    startOnboarding(core);
  });
  $effect(() => watchForUpdates(core));
  $effect(() => watchCommands(core, t));

  const prefs = createSettings('app');
  let panelOpen = $state(prefs.get('panelOpen', window.innerWidth > 640));

  function togglePanel() {
    panelOpen = !panelOpen;
    prefs.set('panelOpen', panelOpen);
  }

  // Full-screen views (planning…), opened from the header or their address (#id).
  const views = $derived(core.ui.views);
  let hash = $state(location.hash);
  $effect(() => {
    const update = () => (hash = location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  });
  const activeView = $derived($views.find((v) => hash === `#${v.id}`));
  $effect(() => {
    core.shortcuts.paused = !!activeView;
    document.documentElement.classList.toggle('in-view', !!activeView);
  });
  function openView(id: string) {
    location.hash = id;
  }
  function closeView() {
    history.pushState(null, '', location.pathname + location.search);
    hash = '';
  }

  // Map pane: base map and overlays, dropping down from the panel header (button or O).
  let paneOpen = $state(prefs.get('mapPane', false));
  const paneSections = $derived($sections.filter((s) => s.placement === 'pane'));
  const listSections = $derived($sections.filter((s) => s.placement !== 'pane'));
  function togglePane() {
    paneOpen = !paneOpen;
    if (paneOpen && !panelOpen) togglePanel();
    if (paneOpen && $phone && $sheetSnap === 'peek') panelSheet.snapTo('half');
    prefs.set('mapPane', paneOpen);
  }

  // On phones the panel is a bottom sheet; it gets out of the way while a map tool is in use.
  const tool = $derived(core.ui.tool);
  const panelSheet = createSheet({
    cssVar: '--panel-h',
    initial: 'peek',
    peek: (node, handle) => handle.offsetHeight + parseFloat(getComputedStyle(node).paddingBottom),
  });
  const sheetSnap = panelSheet.snap;
  $effect(() => {
    if ($tool && $phone) panelSheet.snapTo('peek');
  });
  $effect(() => core.shortcuts.add({ keys: KEYS.mapPane, label: t('layers.togglePane'), run: togglePane }));

  // Panel width: drag the panel's edge; double-click it to go back to the default.
  const DEFAULT_W = 320;
  const MIN_W = 260;
  const MAX_W = 640;
  let panelW = $state(prefs.get('panelWidth', DEFAULT_W));
  let resizing = $state(false);
  $effect(() => {
    document.documentElement.style.setProperty('--panel-w', `${panelW}px`);
  });

  function startResize(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    resizing = true;
    const left = handle.parentElement!.getBoundingClientRect().left;
    const move = (ev: PointerEvent) => {
      panelW = Math.round(Math.min(MAX_W, Math.max(MIN_W, ev.clientX - left)));
    };
    const up = () => {
      resizing = false;
      prefs.set('panelWidth', panelW);
      handle.removeEventListener('pointermove', move);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  function resetWidth() {
    panelW = DEFAULT_W;
    prefs.set('panelWidth', panelW);
  }
</script>

<aside class="panel" class:open={panelOpen} class:resizing aria-label={t('app.title')} use:panelSheet.action={'.sheet-head'}>
  <div
    class="resize"
    role="separator"
    aria-orientation="vertical"
    aria-label={t('app.resizePanel')}
    title={t('app.resizePanel')}
    onpointerdown={startResize}
    ondblclick={resetWidth}
  ></div>
  <div class="sheet-head">
    <div class="grip" aria-hidden="true"></div>
    <header>
      <h1>{t('app.title')}</h1>
      {#each $views as view (view.id)}
        <IconButton icon={view.icon} label={view.label} onclick={() => openView(view.id)} />
      {/each}
      <IconButton icon={icons.layers} label={`${t('layers.pane')} (${core.shortcuts.format(KEYS.mapPane)})`} active={paneOpen} onclick={togglePane} />
      <IconButton
        icon={$theme === 'dark' ? icons.sun : icons.moon}
        label={t('toolbar.theme')}
        onclick={() => theme.toggle()}
      />
      <IconButton icon={icons.settings} label={`${t('settings.title')} (${core.shortcuts.format(KEYS.settings)})`} onclick={openSettings} />
      <span class="panel-btn"><IconButton icon={icons.panel} label={t('toolbar.panel')} onclick={togglePanel} /></span>
    </header>
  </div>
  {#if paneOpen && paneSections.length}
    <div class="map-pane" role="region" aria-label={t('layers.paneTitle')}>
      <div class="pane-head">
        <span>{t('layers.paneTitle')}</span>
        <IconButton icon={icons.close} label={t('card.close')} size={14} onclick={togglePane} />
      </div>
      {#each paneSections as section (section.id)}
        <SafeSection message={t('app.partFailed')}><section.component {...section.props} /></SafeSection>
      {/each}
    </div>
  {/if}
  <div class="panel-search">
    <input
      type="search"
      placeholder={`${t('panel.search')} (${core.shortcuts.format(KEYS.panelSearch)})`}
      aria-label={t('panel.search')}
      bind:this={searchEl}
      bind:value={$panelQuery}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          $panelQuery = '';
          searchEl?.blur();
        }
      }}
    />
    <IconButton
      icon={$appPrefs.compactPanel ? icons.expand : icons.collapse}
      label={$appPrefs.compactPanel ? t('panel.comfortable') : t('panel.compact')}
      size={15}
      active={$appPrefs.compactPanel}
      onclick={() => core.prefs.set('compactPanel', !$appPrefs.compactPanel)}
    />
  </div>
  <div class="sections" class:compact={$appPrefs.compactPanel}>
    {#each listSections as section (section.id)}
      <details open>
        <summary>{section.title}</summary>
        <div class="section-body">
          <SafeSection message={t('app.partFailed')}><section.component {...section.props} /></SafeSection>
        </div>
      </details>
    {/each}
  </div>
</aside>

{#if !panelOpen}
  <div class="panel-toggle">
    <IconButton icon={icons.panel} label={t('toolbar.panel')} onclick={togglePanel} />
  </div>
{/if}

<Toolbar {core} shifted={panelOpen} />
<div class="top" class:shifted={panelOpen} bind:clientHeight={topHeight}>
  {#each $widgets.filter((w) => w.position === 'top') as widget (widget.id)}
    <widget.component {...widget.props} />
  {/each}
</div>
<div class="bottom" class:shifted={panelOpen} bind:clientHeight={bottomHeight}>
  {#if $widgets.some((w) => w.position !== 'top')}
    <div class="widgets">
      {#each $widgets.filter((w) => w.position !== 'top') as widget (widget.id)}
        <widget.component {...widget.props} />
      {/each}
    </div>
  {/if}
  {#each $drawers as drawer (drawer.id)}
    <drawer.component {...drawer.props} />
  {/each}
</div>
<InfoCard {core} />
<Toasts {core} offset={bottomHeight} />

{#if activeView}
  {@const View = activeView.component}
  <div class="view" role="main" aria-label={activeView.label}>
    <SafeSection message={t('app.partFailed')}><View {...activeView.props} close={closeView} /></SafeSection>
  </div>
{/if}

{#if $dialog}
  {@const Dialog = $dialog.component}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && core.ui.closeDialog()}>
    <div class="dialog" role="dialog" aria-modal="true">
      <Dialog {...$dialog.props} />
    </div>
  </div>
{/if}

<svelte:window onkeydowncapture={onKeydown} />

{#if $status === 'loading'}
  <div class="loading" role="status">{t('app.loading')}</div>
{/if}

<style>
  .panel {
    position: absolute;
    top: var(--gap);
    left: var(--gap);
    bottom: var(--gap);
    width: var(--panel-w);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    transform: translateX(calc(-100% - 2 * var(--gap)));
    transition: transform 0.18s ease;
  }

  .resize {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 7px;
    z-index: 1;
    cursor: ew-resize;
  }

  .resize:hover,
  .panel.resizing .resize {
    background: linear-gradient(to right, transparent 4px, var(--accent) 4px);
  }

  /* While resizing, everything that follows the panel's width moves with the pointer. */
  :global(html:has(.panel.resizing)) :global(.toolbar),
  :global(html:has(.panel.resizing)) :global(.bottom),
  :global(html:has(.panel.resizing)) :global(.top) {
    transition: none !important;
  }

  .panel.open {
    transform: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 8px 8px 14px;
    border-bottom: 1px solid var(--border);
  }

  .map-pane {
    flex: none;
    max-height: 60%;
    overflow-y: auto;
    padding: 6px 14px 4px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-sunken);
    animation: drop 0.14s ease-out;
  }

  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }

  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  h1 {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .sections {
    flex: 1;
    overflow-y: auto;
  }

  .panel-search {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--border);
  }

  .panel-search input {
    flex: 1;
    min-width: 0;
  }

  .sections.compact summary {
    padding-block: 6px;
  }

  .sections.compact .section-body {
    padding-bottom: 8px;
  }

  .sections.compact :global(.row > .name) {
    padding-block: 2px;
    font-size: 12.5px;
  }

  details {
    border-bottom: 1px solid var(--border);
  }

  summary {
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
    cursor: pointer;
    user-select: none;
  }

  .section-body {
    padding: 0 14px 14px;
  }

  .panel-toggle {
    position: absolute;
    top: var(--gap);
    left: var(--gap);
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 4px;
  }

  .top {
    position: absolute;
    top: var(--gap);
    left: calc(var(--gap) + 104px);
    right: calc(var(--gap) + var(--card-w, 300px) + 16px);
    display: flex;
    justify-content: safe center;
    pointer-events: none;
    transition: left 0.18s ease;
  }

  .top.shifted {
    left: calc(var(--panel-w) + 2 * var(--gap) + 56px);
  }

  .top > :global(*) {
    pointer-events: auto;
  }

  .bottom {
    position: absolute;
    bottom: calc(var(--gap) + 28px);
    left: var(--gap);
    right: calc(var(--gap) + 44px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    transition: left 0.18s ease;
  }

  .bottom > :global(*) {
    pointer-events: auto;
  }

  .bottom.shifted {
    left: calc(var(--panel-w) + 2 * var(--gap));
  }

  .widgets {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    pointer-events: none !important;
  }

  .widgets > :global(*) {
    pointer-events: auto;
  }

  .view {
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow: hidden;
    background: var(--bg-sunken);
  }

  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: var(--gap);
    background: rgb(0 0 0 / 0.35);
  }

  .dialog {
    width: min(560px, 100%);
    max-height: calc(100% - 2 * var(--gap));
    overflow-y: auto;
    padding: 18px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* Dialogs whose content sets its own width. */
  .dialog:has(> :global(.dialog-sized)) {
    width: auto;
    max-width: 100%;
  }

  .loading {
    position: absolute;
    top: var(--gap);
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 13px;
  }

  .grip {
    display: none;
  }

  /* Phone layout: keep in sync with PHONE_QUERY. */
  @media (max-width: 640px) {
    .resize,
    .panel-btn,
    .panel-toggle {
      display: none;
    }

    .panel,
    .panel.open {
      --sheet-top: calc(var(--safe-top) + 64px);
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      height: 76px;
      padding-bottom: var(--safe-bottom);
      border-radius: 14px 14px 0 0;
      box-shadow: 0 -2px 16px rgb(0 0 0 / 0.16);
      transform: none;
      transition: none;
    }

    .panel:global(.sheet-animate) {
      transition: height 0.22s ease;
    }

    .sheet-head {
      flex: none;
      padding-top: 6px;
      touch-action: none;
      cursor: grab;
    }

    .grip {
      display: block;
      width: 36px;
      height: 5px;
      margin: 0 auto;
      border-radius: 3px;
      background: var(--border);
    }

    header {
      padding-top: 2px;
    }

    .top,
    .top.shifted {
      top: calc(var(--safe-top) + var(--gap));
      left: var(--gap);
      right: var(--gap);
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .bottom,
    .bottom.shifted {
      left: var(--gap);
      bottom: calc(var(--sheet-h) + var(--gap));
      transition: none;
    }

    .backdrop {
      padding: calc(var(--safe-top) + 8px) 8px calc(var(--safe-bottom) + 8px);
    }

    .dialog {
      padding: 14px;
    }
  }
</style>
