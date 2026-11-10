<script lang="ts">
  import type { Core } from '../core/core';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';

  let { core, offset = 0 }: { core: Core; offset?: number } = $props();
  const toasts = $derived(core.ui.toasts);
</script>

<div class="toasts" aria-live="polite" style:bottom="{40 + offset}px">
  {#each $toasts as toast (toast.id)}
    <div class="toast {toast.kind}" role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          class="action"
          onclick={() => {
            toast.action?.run();
            core.ui.dismiss(toast.id);
          }}>{toast.action.label}</button
        >
      {/if}
      <IconButton icon={icons.close} label="Dismiss" size={14} onclick={() => core.ui.dismiss(toast.id)} />
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    z-index: 30;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    width: min(440px, calc(100% - 2 * var(--gap)));
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: var(--radius);
    border-left: 4px solid var(--fg-muted);
    background: var(--bg);
    box-shadow: var(--shadow);
    pointer-events: auto;
  }

  .toast span {
    flex: 1;
  }

  .action {
    flex: none;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }

  .action:hover {
    background: var(--bg-hover);
  }

  .toast.warn {
    border-left-color: var(--warn);
  }

  .toast.error {
    border-left-color: var(--danger);
  }
</style>
