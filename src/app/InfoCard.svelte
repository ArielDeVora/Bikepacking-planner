<script lang="ts">
  import type { Core } from '../core/core';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';

  let { core }: { core: Core } = $props();
  const { t, selection } = $derived(core);
  const store = $derived(core.store);
  const ids = $derived(core.selection.ids);
  const cards = $derived(core.ui.cards);

  const target = $derived.by(() => {
    void $store;
    if ($ids.length !== 1) return null;
    const entity = store.get($ids[0]!);
    const renderer = entity && $cards.get(entity.type);
    return entity && renderer ? { id: entity.id, renderer } : null;
  });
</script>

{#if target}
  <div class="card" role="dialog" aria-label="Details">
    <div class="close">
      <IconButton icon={icons.close} label={t('card.close')} size={16} onclick={() => selection.clear()} />
    </div>
    {#key target.id}
      <target.renderer.component id={target.id} {...target.renderer.props} />
    {/key}
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: var(--gap);
    right: var(--gap);
    width: 300px;
    max-height: calc(100% - 2 * var(--gap) - 120px);
    overflow-y: auto;
    padding: 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .close {
    position: absolute;
    top: 6px;
    right: 6px;
  }

  @media (max-width: 640px) {
    .card {
      left: var(--gap);
      width: auto;
      max-height: 45vh;
    }
  }
</style>
