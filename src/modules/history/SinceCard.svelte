<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { timeAgo } from '../../lib/time';
  import type { SinceSummary } from './since';

  let {
    ctx,
    summary,
    openHistory,
    close,
  }: {
    ctx: ModuleContext;
    summary: Readable<{ since: number; data: SinceSummary } | null>;
    openHistory: () => void;
    close: () => void;
  } = $props();
  const { t, cloud } = $derived(ctx);
  const members = $derived(ctx.cloud.members);

  const person = (id: string) => {
    void $members;
    const p = cloud.profileOf(id);
    return { name: p?.name || t('collab.someone'), color: p?.color ?? 'var(--fg-muted)' };
  };

  const counts = (p: SinceSummary['people'][number]) =>
    [
      p.edits && t('since.edits', { n: p.edits }),
      p.comments && t('since.comments', { n: p.comments }),
      p.votes && t('since.votes', { n: p.votes }),
    ]
      .filter(Boolean)
      .join(', ');

  const show = (id: string) => ctx.selection.set([id]);
</script>

{#if $summary}
  {@const { since, data } = $summary}
  <section class="since" aria-label={t('since.title')}>
    <header>
      <strong>{t('since.title')}</strong>
      <span class="muted">{timeAgo(t, since)}</span>
      <span class="close"><IconButton icon={icons.close} label={t('since.dismiss')} size={13} onclick={close} /></span>
    </header>
    {#if data.mentions.length}
      <ul class="mentions">
        {#each data.mentions.slice(0, 3) as c (c.id)}
          {@const p = person(c.authorId)}
          <li>
            <button type="button" onclick={() => show(c.targetId)}>
              <span class="at">@</span>
              <span>
                <strong>{t('since.mentioned', { name: p.name })}</strong>
                <span class="quote">{c.body}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <ul class="people">
      {#each data.people as p (p.userId)}
        {@const who = person(p.userId)}
        <li><span class="dot" style:background={who.color}></span><strong>{who.name}</strong> <span class="muted">{counts(p)}</span></li>
      {/each}
    </ul>
    {#if data.suggestions.length}
      <ul class="people">
        {#each data.suggestions as s (s.name)}
          <li><span class="dot follower"></span><strong>{s.name || t('follow.aFollower')}</strong> <span class="muted">{t('since.suggested', { n: s.count })}</span></li>
        {/each}
      </ul>
    {/if}
    <footer>
      {#if data.latest}
        <button type="button" class="link" onclick={() => show(data.latest!.id)}>{t('since.latest')}</button>
      {/if}
      <button type="button" class="link" onclick={openHistory}>{t('since.history')}</button>
    </footer>
  </section>
{/if}

<style>
  .since {
    width: 280px;
    max-width: calc(100vw - 32px);
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 12px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .close {
    margin-left: auto;
  }

  .close :global(.icon-btn) {
    width: 22px;
    height: 22px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .people li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 0;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    align-self: center;
  }

  .muted {
    color: var(--fg-muted);
  }

  .dot.follower {
    background: #ae3ec9;
  }

  .mentions {
    margin-bottom: 6px;
  }

  .mentions button {
    display: flex;
    gap: 8px;
    width: 100%;
    padding: 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    text-align: left;
    cursor: pointer;
    margin-bottom: 4px;
  }

  .at {
    font-weight: 700;
    color: var(--accent);
  }

  .quote {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--fg-muted);
  }

  footer {
    display: flex;
    gap: 12px;
    margin-top: 6px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;
  }
</style>
