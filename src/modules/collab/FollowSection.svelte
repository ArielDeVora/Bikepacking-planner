<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import type { Readable } from 'svelte/store';
  import type { Award } from './badges';
  import BadgeLegend from './BadgeLegend.svelte';
  import MemberBadges from './MemberBadges.svelte';

  let { ctx, badges }: { ctx: ModuleContext; badges: Readable<Map<string, Award[]>> } = $props();
  const { t } = $derived(ctx);
  const members = $derived(ctx.cloud.members);
  const store = $derived(ctx.store);
  const name = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip')?.name || t('trip.defaultName');
  });
  const ownApp = `${location.origin}${location.pathname}`;
</script>

<p class="small">{t('follow.viewing', { name })}</p>
<p class="muted small">{t('follow.viewingHint')}</p>
{#if $members.length}
  <div class="muted small head">{t('collab.members')}</div>
  <ul>
    {#each $members as m (m.id)}
      <li class="small"><span class="dot" style:background={m.color}></span>{m.name || t('collab.someone')} <MemberBadges {badges} id={m.id} {t} /></li>
    {/each}
  </ul>
  <BadgeLegend {badges} members={$members} {t} isMine={() => false} />
{/if}
<a class="small" href={ownApp}>{t('follow.openOwn')}</a>

<style>
  .small {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.4;
  }

  .muted {
    color: var(--fg-muted);
  }

  .head {
    font-weight: 600;
  }

  ul {
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  a {
    color: var(--accent);
  }
</style>
