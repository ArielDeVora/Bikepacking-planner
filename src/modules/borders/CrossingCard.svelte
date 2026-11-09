<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import type { CrossingStatus } from '../../model/types';
  import type { Crossing } from './countries';
  import { postsNear, type BorderPost } from './posts';

  let {
    ctx,
    crossing,
    annotate,
    annotationFor,
  }: {
    ctx: ModuleContext;
    crossing: Crossing;
    annotate: (crossing: Crossing, post: BorderPost | null, status?: CrossingStatus) => void;
    annotationFor: (crossing: Crossing, posts: BorderPost[]) => string | null;
  } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  let posts = $state<BorderPost[] | null | undefined>(undefined);
  $effect(() => {
    const c = crossing;
    posts = undefined;
    void postsNear(c.lngLat).then((p) => {
      if (c === crossing) posts = p;
    });
  });

  const segment = $derived.by(() => {
    void $store;
    return store.get(crossing.segmentId, 'segment');
  });
  const existing = $derived.by(() => {
    void $store;
    return annotationFor(crossing, posts ?? []);
  });
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
</script>

<h3>{crossing.from.name} → {crossing.to.name}</h3>
<p class="muted small">
  {t('border.atKm', { km: Math.round(crossing.atM / 1000) })}{segment ? ` · ${segment.name}` : ''}{crossing.byAir ? ` · ${t('border.byAir')}` : ''}
</p>

{#if existing}
  <button type="button" class="btn primary" onclick={() => ctx.selection.set([existing])}>{t('border.openAnnotation')}</button>
{:else}
  <div class="field">
    <span class="muted small">{t('border.setStatus')}</span>
    <div class="seg" role="group">
      {#each ['open', 'closedToForeigners', 'unknown'] as const as s (s)}
        <button type="button" class={s} onclick={() => annotate(crossing, posts?.[0] ?? null, s)}>{t(`border.status.${s}`)}</button>
      {/each}
    </div>
  </div>
{/if}

<div class="posts">
  <strong>{t('border.posts')}</strong>
  {#if posts === undefined}
    <p class="muted small">{t('border.loadingPosts')}</p>
  {:else if posts === null}
    <p class="muted small">{t('border.postsUnavailable')}</p>
  {:else if posts.length === 0}
    <p class="muted small">{t('border.noPosts')}</p>
  {:else}
    <ul>
      {#each posts.slice(0, 4) as post (post.type + post.id)}
        <li>
          <span>{post.name || t('border.unnamedPost')} <span class="muted">· {km(post.distM)}</span></span>
          {#if !existing}<button type="button" class="link" onclick={() => annotate(crossing, post)}>{t('border.annotate')}</button>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
{#if !existing}
  <button type="button" class="btn" onclick={() => annotate(crossing, null)}>{t('border.annotateHere')}</button>
{/if}
<p class="muted small note">{t('border.precision')}</p>

<style>
  h3 {
    margin: 0 28px 2px 0;
    font-size: 15px;
  }

  .small {
    font-size: 12px;
  }

  .posts {
    margin: 10px 0;
    font-size: 13px;
  }

  ul {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
  }

  .link {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }

  .btn {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .seg {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg button {
    flex: 1;
    padding: 5px 2px;
    border: 0;
    background: var(--bg);
    font-size: 12px;
    cursor: pointer;
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg .open:hover {
    background: #ebfbee;
  }

  .seg .closedToForeigners:hover {
    background: #ffe3e3;
  }

  .note {
    margin-top: 10px;
  }
</style>
