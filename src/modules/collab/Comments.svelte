<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { newId } from '../../model/ids';
  import type { Comment } from '../../model/types';
  import { timeAgo } from '../../lib/time';
  import { findMentions, insertMention, mentionAt, splitMentions, suggest, type Person } from './mentions';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, cloud, commands } = $derived(ctx);
  const store = $derived(ctx.store);
  const members = $derived(ctx.cloud.members);

  let body = $state('');
  let input = $state<HTMLTextAreaElement>();
  let caret = $state(0);
  let pick = $state(0);

  const people = $derived<Person[]>($members.map((m) => ({ id: m.id, name: m.name })).filter((p) => p.name));
  const typing = $derived(mentionAt(body, caret));
  const options = $derived(typing ? suggest(people, typing.query) : []);

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
          parts: splitMentions(c.body, people),
          forMe: !!c.mentions?.some((m) => cloud.isMine(m)),
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
    const mentioned = findMentions(text, people);
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
          ...(mentioned.length ? { mentions: mentioned } : {}),
        }),
      ],
    });
    body = '';
    caret = 0;
  }

  function choose(p: Person) {
    if (!typing) return;
    const next = insertMention(body, typing, p);
    body = next.text;
    caret = next.caret;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.caret, next.caret);
    });
  }

  const track = () => {
    caret = input?.selectionStart ?? body.length;
    pick = 0;
  };

  function onKey(e: KeyboardEvent) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick = (pick + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        choose(options[pick] ?? options[0]!);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        caret = -1;
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e);
  }
</script>

<section class="comments">
  <h3>{t('comments.title')}{comments.length ? ` (${comments.length})` : ''}</h3>
  {#each comments as { c, mine, name, color, parts, forMe } (c.id)}
    <article class:for-me={forMe}>
      <header>
        <span class="dot" style:background={color}></span>
        <strong>{name}</strong>
        <span class="muted">{timeAgo(t, c.createdAt)}</span>
        {#if mine && !ctx.readOnly}
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
      <p>
        {#each parts as part, i (i)}
          {#if part.person}<span class="mention" class:me={cloud.isMine(part.person.id)}>{part.text}</span>{:else}{part.text}{/if}
        {/each}
      </p>
    </article>
  {/each}
  {#if !ctx.readOnly}
  <form onsubmit={post}>
    <div class="field">
      <textarea
        rows="2"
        placeholder={t('comments.placeholder')}
        bind:this={input}
        bind:value={body}
        onkeydown={onKey}
        oninput={track}
        onclick={track}
        onkeyup={(e) => {
          if (e.key.startsWith('Arrow') && !options.length) track();
        }}
        onblur={() => setTimeout(() => (caret = -1), 150)}
      ></textarea>
      {#if options.length}
        <ul class="suggest" role="listbox" aria-label={t('comments.mention')}>
          {#each options as p, i (p.id)}
            <li role="option" aria-selected={i === pick}>
              <button type="button" class:active={i === pick} onmousedown={(e) => e.preventDefault()} onclick={() => choose(p)}>
                <span class="dot" style:background={cloud.profileOf(p.id)?.color ?? 'var(--fg-muted)'}></span>
                {p.name}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <button type="submit" disabled={!body.trim()}>{t('comments.post')}</button>
  </form>
  {/if}
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
    width: 100%;
  }

  .field {
    position: relative;
  }

  .suggest {
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 5;
    min-width: 160px;
    margin: 2px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
  }

  .suggest button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .suggest button.active,
  .suggest button:hover {
    background: var(--bg-hover);
  }

  .mention {
    font-weight: 600;
    color: var(--accent);
  }

  .mention.me {
    padding: 0 2px;
    border-radius: 3px;
    background: var(--accent-soft);
  }

  article.for-me {
    padding-left: 4px;
    border-left: 2px solid var(--accent);
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
