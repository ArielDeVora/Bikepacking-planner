<script lang="ts">
  import type { Core } from '../core/core';
  import { createSettings } from '../core/settings';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';
  import InfoCard from './InfoCard.svelte';
  import Toasts from './Toasts.svelte';
  import Toolbar from './Toolbar.svelte';

  let { core }: { core: Core } = $props();
  const { t } = $derived(core);
  const sections = $derived(core.ui.panelSections);
  const widgets = $derived(core.ui.widgets);
  const drawers = $derived(core.ui.drawers);
  let bottomHeight = $state(0);
  const dialog = $derived(core.ui.dialog);

  function onKeydown(e: KeyboardEvent) {
    if ($dialog && e.key === 'Escape') {
      e.stopPropagation();
      core.ui.closeDialog();
    }
  }
  const theme = $derived(core.theme);
  const status = $derived(core.status);

  const prefs = createSettings('app');
  let panelOpen = $state(prefs.get('panelOpen', window.innerWidth > 640));

  function togglePanel() {
    panelOpen = !panelOpen;
    prefs.set('panelOpen', panelOpen);
  }
</script>

<aside class="panel" class:open={panelOpen} aria-label={t('app.title')}>
  <header>
    <h1>{t('app.title')}</h1>
    <IconButton
      icon={$theme === 'dark' ? icons.sun : icons.moon}
      label={t('toolbar.theme')}
      onclick={() => theme.toggle()}
    />
    <IconButton icon={icons.panel} label={t('toolbar.panel')} onclick={togglePanel} />
  </header>
  <div class="sections">
    {#each $sections as section (section.id)}
      <details open>
        <summary>{section.title}</summary>
        <div class="section-body">
          <section.component {...section.props} />
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
<div class="bottom" class:shifted={panelOpen} bind:clientHeight={bottomHeight}>
  {#if $widgets.length}
    <div class="widgets">
      {#each $widgets as widget (widget.id)}
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

  h1 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .sections {
    flex: 1;
    overflow-y: auto;
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

  .backdrop {
    position: absolute;
    inset: 0;
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

  @media (max-width: 640px) {
    .bottom.shifted {
      left: var(--gap);
    }

    .panel {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      max-height: 60vh;
      border-radius: var(--radius) var(--radius) 0 0;
      transform: translateY(100%);
    }
  }
</style>
