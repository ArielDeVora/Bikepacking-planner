<script lang="ts">
  import type { t as translate } from '../../core/i18n';

  let { t }: { t: typeof translate } = $props();
  let online = $state(typeof navigator === 'undefined' || navigator.onLine);
  $effect(() => {
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });
</script>

{#if !online}
  <div class="badge" role="status" title={t('offline.badgeHint')}>
    <span class="dot"></span>
    {t('offline.badge')}
  </div>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: center;
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 12px;
    font-weight: 600;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warn);
  }
</style>
