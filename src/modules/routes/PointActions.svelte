<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { t as translate } from '../../core/i18n';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { isCoarse, phone } from '../../lib/ui/phone';

  let { t, anchor, remove }: { t: typeof translate; anchor: Readable<number | null>; remove: () => void } = $props();

  // Without a right-click, touch screens delete the selected point with a button.
  const touch = isCoarse();
</script>

{#if (touch || $phone) && $anchor !== null}
  <button type="button" class="delete" onclick={remove}>
    <Icon d={icons.trash} size={16} />
    {t('routes.deletePoint')}
  </button>
{/if}

<style>
  .delete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 14px;
    border: 0;
    border-radius: 999px;
    background: var(--bg);
    box-shadow: var(--shadow);
    color: var(--danger);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
