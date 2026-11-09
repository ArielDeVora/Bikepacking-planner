<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { timeAgo } from './time';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, cloud } = $derived(ctx);
  const store = $derived(ctx.store);
  const shared = $derived(ctx.cloud.shared);
  const members = $derived(ctx.cloud.members);

  const info = $derived.by(() => {
    void $store;
    void $members;
    const e = store.get(id);
    if (!e || !e.updatedBy) return null;
    const mine = cloud.isMine(e.updatedBy);
    const p = cloud.profileOf(e.updatedBy);
    return {
      name: mine ? t('collab.you') : p?.name || t('collab.someone'),
      color: p?.color ?? 'var(--fg-muted)',
      when: timeAgo(t, e.updatedAt),
    };
  });
</script>

{#if $shared && info}
  <p class="edited">
    <span class="dot" style:background={info.color}></span>
    {t('collab.editedBy', { name: info.name, when: info.when })}
  </p>
{/if}

<style>
  .edited {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--fg-muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
