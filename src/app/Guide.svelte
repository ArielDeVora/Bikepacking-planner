<script lang="ts">
  import type { Core } from '../core/core';
  import type { StringKey } from '../core/i18n';
  import { icons } from '../lib/icons';
  import Icon from '../lib/ui/Icon.svelte';

  let { core }: { core: Core } = $props();
  const { t } = $derived(core);

  const STEPS: { id: string; icon: string }[] = [
    { id: 'welcome', icon: icons.bike },
    { id: 'tree', icon: icons.layers },
    { id: 'draw', icon: icons.route },
    { id: 'select', icon: icons.pencil },
    { id: 'elevation', icon: icons.mountain },
    { id: 'places', icon: icons.pin },
    { id: 'files', icon: icons.upload },
    { id: 'share', icon: icons.users },
    { id: 'history', icon: icons.history },
    { id: 'help', icon: icons.help },
  ];

  let index = $state(0);
  const step = $derived(STEPS[index]!);
  const last = $derived(index === STEPS.length - 1);
  const close = () => core.ui.closeDialog();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' && !last) index++;
    else if (e.key === 'ArrowLeft' && index > 0) index--;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="guide dialog-sized">
  <p class="muted small">{t('guide.step', { n: index + 1, total: STEPS.length })}</p>
  <div class="icon"><Icon d={step.icon} size={28} /></div>
  <h2>{t(`guide.${step.id}.title` as StringKey)}</h2>
  <p class="text">{t(`guide.${step.id}.text` as StringKey)}</p>

  <div class="dots" role="tablist" aria-label={t('guide.title')}>
    {#each STEPS as s, i (s.id)}
      <button
        type="button"
        class="dot"
        class:on={i === index}
        role="tab"
        aria-selected={i === index}
        aria-label={t(`guide.${s.id}.title` as StringKey)}
        onclick={() => (index = i)}
      ></button>
    {/each}
  </div>

  <div class="buttons">
    {#if !last}
      <button type="button" class="link" onclick={close}>{t('guide.skip')}</button>
    {/if}
    <span class="spacer"></span>
    {#if index > 0}
      <button type="button" class="btn" onclick={() => index--}>{t('guide.back')}</button>
    {/if}
    {#if last}
      <button type="button" class="btn primary" onclick={close}>{t('guide.done')}</button>
    {:else}
      <button type="button" class="btn primary" onclick={() => index++}>{t('guide.next')}</button>
    {/if}
  </div>
</div>

<style>
  .guide {
    width: min(440px, calc(100vw - 72px));
    text-align: center;
  }

  .small {
    margin: 0 0 10px;
    font-size: 12px;
  }

  .icon {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }

  h2 {
    margin: 12px 0 8px;
    font-size: 17px;
  }

  .text {
    min-height: 4.8em;
    margin: 0 auto;
    max-width: 380px;
    font-size: 14px;
    line-height: 1.55;
  }

  .dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin: 16px 0 4px;
  }

  .dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--border);
    cursor: pointer;
  }

  .dot.on {
    background: var(--accent);
  }

  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }

  .spacer {
    flex: 1;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }
</style>
