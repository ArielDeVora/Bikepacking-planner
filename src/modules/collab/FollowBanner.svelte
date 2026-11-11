<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);
  const name = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip')?.name || t('trip.defaultName');
  });
</script>

<div class="banner" role="status" title={t('follow.viewingHint')}>
  <Icon d={icons.eye} size={14} />
  {t('follow.banner', { name })}
</div>

<style>
  .banner {
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
</style>
