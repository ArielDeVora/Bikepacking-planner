<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { StringKey, t as translate } from '../../core/i18n';
  import type { Award } from './badges';

  let { badges, id, t }: { badges: Readable<Map<string, Award[]>>; id: string; t: typeof translate } = $props();
  const awards = $derived($badges.get(id) ?? []);
  const title = (a: Award) => `${t(`badge.${a.badge.id}` as StringKey)}: ${t(`badge.${a.badge.id}.what` as StringKey, { n: a.value.toLocaleString() })}`;
</script>

{#if awards.length}
  <span class="badges">
    {#each awards as a (a.badge.id)}<span class="badge" title={title(a)} aria-label={title(a)}>{a.badge.emoji}</span>{/each}
  </span>
{/if}

<style>
  .badges {
    display: inline-flex;
    gap: 1px;
    font-size: 13px;
    line-height: 1;
  }

  .badge {
    cursor: help;
  }
</style>
