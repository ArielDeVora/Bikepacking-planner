<script lang="ts">
  import type { Core } from '../core/core';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';

  let { core }: { core: Core } = $props();
  const { t, selection } = $derived(core);
  const store = $derived(core.store);
  const ids = $derived(core.selection.ids);
  const cards = $derived(core.ui.cards);
  const sections = $derived(core.ui.cardSections);
  const place = $derived(core.ui.place);
  const multiCards = $derived(core.ui.multiCards);
  const multi = $derived($ids.length > 1 && $multiCards.length > 0);

  const target = $derived.by(() => {
    void $store;
    if ($ids.length !== 1) return null;
    const entity = store.get($ids[0]!);
    const renderer = entity && $cards.get(entity.type);
    return entity && renderer ? { id: entity.id, type: entity.type, renderer } : null;
  });
</script>

{#if target || multi || $place}
  <div class="card" role="dialog" aria-label="Details">
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
    {#if multi}
      {#each $multiCards as card (card.id)}
        <card.component ids={$ids} {...card.props} />
      {/each}
    {:else if target}
      {#key target.id}
        <target.renderer.component id={target.id} {...target.renderer.props} />
        {#each $sections.filter((s) => !s.types || s.types.includes(target.type)) as section (section.id)}
          <section.component id={target.id} {...section.props} />
        {/each}
      {/key}
    {:else if $place}
      {@const Place = $place.component}
      {#key $place}
        <Place {...$place.props} />
      {/key}
    {/if}
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
