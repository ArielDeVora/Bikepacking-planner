<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { t as translate } from '../../core/i18n';

  let { t, status }: { t: typeof translate; status: Readable<'hidden' | 'zoom' | 'loading' | 'busy' | 'ready'> } = $props();
</script>

{#if $status === 'zoom' || $status === 'loading' || $status === 'busy'}
  <div class="pill" class:warn={$status === 'busy'}>{t(`osm.status.${$status}`)}</div>
{/if}

<style>
  .pill {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 12px;
  }

  .warn {
    color: var(--warn);
  }
</style>
