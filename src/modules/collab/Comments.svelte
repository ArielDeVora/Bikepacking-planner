<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { newId } from '../../model/ids';
  import type { Comment } from '../../model/types';
  import { timeAgo } from './time';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, cloud, commands } = $derived(ctx);
  const store = $derived(ctx.store);
  const members = $derived(ctx.cloud.members);

  let body = $state('');

  const comments = $derived.by(() => {
    void $store;
    void $members;
    return store
      .list('comment', (c) => c.targetId === id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => {
        const p = cloud.profileOf(c.authorId);
        return {
          c,
          mine: cloud.isMine(c.authorId),
          name: cloud.isMine(c.authorId) ? t('collab.you') : p?.name || t('collab.someone'),
          color: p?.color ?? 'var(--fg-muted)',
        };
      });
  });

  function post(e?: Event) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    commands.run({
      label: t('cmd.addComment'),
      changes: [
        edits.create<Comment>({
          id: newId(),
          type: 'comment',
          tripId: ctx.tripId,
          targetId: id,
          body: text,
          authorId: ctx.user.id,
          createdAt: Date.now(),
        }),
      ],
    });
    body = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e);
  }
</script>

<section class="comments">
  <h3>{t('comments.title')}{comments.length ? ` (${comments.length})` : ''}</h3>
  {#each comments as { c, mine, name, color } (c.id)}
    <article>
      <header>
        <span class="dot" style:background={color}></span>
        <strong>{name}</strong>
        <span class="muted">{timeAgo(t, c.createdAt)}</span>
        {#if mine}
          <span class="del">
            <IconButton
              icon={icons.trash}
              label={t('comments.delete')}
              size={13}
              onclick={() => commands.run({ label: t('cmd.deleteComment'), changes: [edits.remove(store, c.id)] })}
            />
          </span>
        {/if}
      </header>
      <p>{c.body}</p>
    </article>
  {/each}
  <form onsubmit={post}>
    <textarea rows="2" placeholder={t('comments.placeholder')} bind:value={body} onkeydown={onKey}></textarea>
    <button type="submit" disabled={!body.trim()}>{t('comments.post')}</button>
  </form>
</section>

<style>
  .comments {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-muted);
  }

  article {
    margin-bottom: 8px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .del {
    margin-left: auto;
  }

  .del :global(.icon-btn) {
    width: 22px;
    height: 22px;
  }

  p {
    margin: 2px 0 0 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  form {
    display: grid;
    gap: 6px;
  }

  textarea {
    min-height: 0;
  }

  button[type='submit'] {
    justify-self: end;
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  button[type='submit']:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
