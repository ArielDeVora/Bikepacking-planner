<script lang="ts">
  import { untrack } from 'svelte';
  import { savedFollower } from '../../core/cloud/follow';
  import type { ModuleContext } from '../../core/module';

  let { ctx, lngLat, name: placeName = '' }: { ctx: ModuleContext; lngLat: [number, number]; name?: string } = $props();
  const { t } = $derived(ctx);

  const known = savedFollower();
  let who = $state(known?.name ?? '');
  let editingName = $state(!known);
  let name = $state(untrack(() => placeName));
  let notes = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    if (!ctx.follow || !who.trim() || !name.trim()) return;
    busy = true;
    error = '';
    try {
      const id = await ctx.follow.suggest({ name: name.trim(), lngLat, notes: notes.trim() }, who.trim());
      ctx.ui.closeDialog();
      ctx.ui.closePlace();
      ctx.selection.set([id]);
      ctx.ui.notify(t('suggest.thanks', { name: name.trim() }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<form class="suggest dialog-sized" onsubmit={submit}>
  <h2>{t('suggest.title')}</h2>
  <p class="muted">{t('suggest.intro')}</p>
  {#if editingName}
    <label>
      <span>{t('suggest.yourName')}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={who} maxlength="60" placeholder={t('suggest.yourNameHint')} autofocus={!known} required />
    </label>
  {:else}
    <p class="small">
      {t('suggest.as', { name: who })}
      <button type="button" class="link" onclick={() => (editingName = true)}>{t('suggest.notYou')}</button>
    </p>
  {/if}
  <label>
    <span>{t('suggest.placeName')}</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={name} maxlength="200" required autofocus={!!known} />
  </label>
  <label>
    <span>{t('suggest.notes')}</span>
    <textarea bind:value={notes} rows="3" maxlength="2000" placeholder={t('suggest.notesHint')}></textarea>
  </label>
  {#if error}<p class="error small">{t('suggest.failed', { reason: error })}</p>{/if}
  <div class="buttons">
    <button type="button" class="btn" onclick={() => ctx.ui.closeDialog()}>{t('suggest.cancel')}</button>
    <button type="submit" class="btn primary" disabled={busy || !who.trim() || !name.trim()}>{t('suggest.send')}</button>
  </div>
</form>

<style>
  .suggest {
    display: grid;
    gap: 10px;
    width: 380px;
    max-width: 100%;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--fg-muted);
    font-size: 13px;
  }

  .small {
    font-size: 12px;
  }

  label {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;
  }

  .error {
    color: var(--danger);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
