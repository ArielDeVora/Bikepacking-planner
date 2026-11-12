<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { StringKey, t as translate } from '../../core/i18n';
  import type { Member } from '../../core/cloud/cloud';
  import { BADGES, type Award } from './badges';

  let {
    badges,
    members,
    t,
    isMine,
  }: { badges: Readable<Map<string, Award[]>>; members: Member[]; t: typeof translate; isMine: (id: string) => boolean } = $props();

  /** Each badge won, with who holds it. */
  const won = $derived(
    BADGES.flatMap((badge) => {
      const holders = members.flatMap((m) => {
        const a = ($badges.get(m.id) ?? []).find((x) => x.badge.id === badge.id);
        return a ? [{ name: isMine(m.id) ? t('collab.you') : m.name || t('collab.someone'), value: a.value }] : [];
      });
      return holders.length ? [{ badge, holders }] : [];
    }),
  );
</script>

{#if won.length}
  <details class="legend">
    <summary class="muted small">{t('badge.title')}</summary>
    <ul>
      {#each won as w (w.badge.id)}
        <li class="small">
          <span class="emoji">{w.badge.emoji}</span>
          <span>
            <strong>{t(`badge.${w.badge.id}` as StringKey)}</strong>
            · {w.holders.map((h) => h.name).join(', ')}
            <span class="muted">({t(`badge.${w.badge.id}.what` as StringKey, { n: w.holders[0]!.value.toLocaleString() })})</span>
          </span>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .legend {
    margin: 4px 0 8px;
  }

  summary {
    cursor: pointer;
  }

  ul {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: 6px;
    padding: 2px 0;
  }

  .small {
    font-size: 12px;
    line-height: 1.4;
  }

  .muted {
    color: var(--fg-muted);
  }

  .emoji {
    flex: none;
  }
</style>
