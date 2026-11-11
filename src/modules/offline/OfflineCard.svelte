<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { segmentsOf } from '../../lib/tree';
  import { segmentCoords } from '../../model/segment';
  import { canSaveOffline, saveTiles, tileTemplate } from './download';
  import { planTiles, TILE_KB } from './tiles';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  // The tiles along everything this card is about (a segment, group, stage or route).
  const plan = $derived.by(() => {
    void $store;
    const coords = segmentsOf(store, id)
      .filter((s) => s.mode === 'bike' || s.mode === 'walk')
      .flatMap((s) => segmentCoords(s));
    return coords.length > 1 ? planTiles(coords) : null;
  });

  let progress = $state<{ done: number; total: number } | null>(null);
  let ctrl: AbortController | null = null;

  async function save() {
    const template = tileTemplate(ctx.map);
    if (!plan || !template) return;
    ctrl = new AbortController();
    progress = { done: 0, total: plan.tiles.length };
    try {
      await saveTiles(template, plan.tiles, (done, total) => (progress = { done, total }), ctrl.signal);
      if (!ctrl.signal.aborted) ctx.ui.notify(t('offline.saved', { zoom: plan.maxZoom }), 'info', 6000);
    } catch (err) {
      ctx.ui.notify(t('offline.failed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      progress = null;
      ctrl = null;
    }
  }
</script>

{#if plan && canSaveOffline()}
  <section class="offline">
    <h4>{t('offline.title')}</h4>
    {#if progress}
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <span style:width="{(progress.done / progress.total) * 100}%"></span>
      </div>
      <p class="muted small">
        {t('offline.saving', { done: progress.done, total: progress.total })}
        <button type="button" class="link" onclick={() => ctrl?.abort()}>{t('offline.cancel')}</button>
      </p>
    {:else if plan.tooBig}
      <p class="muted small">{t('offline.tooBig')}</p>
    {:else}
      <p class="muted small">{t('offline.hint', { n: plan.tiles.length, mb: Math.max(1, Math.round((plan.tiles.length * TILE_KB) / 1024)), zoom: plan.maxZoom })}</p>
      <button type="button" class="btn" onclick={save}>{t('offline.save')}</button>
    {/if}
  </section>
{/if}

<style>
  .offline {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  h4 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .small {
    margin: 4px 0;
    font-size: 12px;
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-sunken);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .btn {
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
</style>
