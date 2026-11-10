<script lang="ts">
  import type { Release } from '../config/releases';
  import type { Core } from '../core/core';
  import { openGuide } from './onboarding';

  let { core, releases }: { core: Core; releases: Release[] } = $props();
  const { t } = $derived(core);

  const date = (id: string) => {
    const d = new Date(`${id.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? id : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  };
</script>

<div class="news dialog-sized">
  <h2>{t('news.title')}</h2>

  <div class="releases">
    {#each releases as release (release.id)}
      <section>
        <h3>{release.title} <span class="muted">· {date(release.id)}</span></h3>
        <ul>
          {#each release.items as item (item)}<li>{item}</li>{/each}
        </ul>
      </section>
    {/each}
  </div>

  <div class="buttons">
    <button type="button" class="btn" onclick={() => openGuide(core)}>{t('news.guide')}</button>
    <button type="button" class="btn primary" onclick={() => core.ui.closeDialog()}>{t('news.ok')}</button>
  </div>
</div>

<style>
  .news {
    width: min(520px, calc(100vw - 72px));
  }

  h2 {
    margin: 0 0 12px;
    font-size: 16px;
  }

  .releases {
    display: grid;
    gap: 14px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  h3 .muted {
    font-weight: 400;
    font-size: 12px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.55;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .btn {
    padding: 6px 14px;
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
</style>
