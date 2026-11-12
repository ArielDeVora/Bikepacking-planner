<script lang="ts">
  import { followUrl } from '../../core/cloud/follow';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, cloud, ui } = $derived(ctx);

  let links = $state<{ token: string; createdAt: string; createdBy: string; canSuggest: boolean | null }[]>([]);
  const members = $derived(ctx.cloud.members);
  const maker = (id: string) => {
    void $members;
    return cloud.isMine(id) ? t('collab.you') : cloud.profileOf(id)?.name || t('collab.someone');
  };

  async function toggleSuggest(token: string, on: boolean) {
    try {
      await cloud.setFollowSuggest(token, on);
      await load();
    } catch (err) {
      ui.notify(t('follow.failed', { reason: reason(err) }), 'error');
      await load();
    }
  }
  let missing = $state(false);
  let busy = $state(false);

  const reason = (err: unknown) => (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
  /** The table isn't there: migration 004 hasn't been run. */
  const isMissing = (err: unknown) => /follow_links|PGRST205|42P01/.test(`${(err as { code?: string })?.code ?? ''} ${reason(err)}`);

  async function load() {
    try {
      links = await cloud.followLinks();
      missing = false;
    } catch (err) {
      if (isMissing(err)) missing = true;
      else console.warn(err);
    }
  }
  $effect(() => {
    void load();
  });

  async function copy(token: string) {
    const url = followUrl(token);
    if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => window.prompt(t('follow.link'), url));
    else window.prompt(t('follow.link'), url);
    ui.notify(t('follow.copied'));
  }

  async function create() {
    busy = true;
    try {
      const token = await cloud.createFollowLink();
      await load();
      await copy(token);
    } catch (err) {
      if (isMissing(err)) missing = true;
      else ui.notify(t('follow.failed', { reason: reason(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  async function stop(token: string) {
    if (!window.confirm(t('follow.stopConfirm'))) return;
    try {
      await cloud.deleteFollowLink(token);
      await load();
      ui.notify(t('follow.stopped'));
    } catch (err) {
      ui.notify(t('follow.failed', { reason: reason(err) }), 'error');
    }
  }

  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<div class="follow">
  <div class="head muted small">{t('follow.title')}</div>
  {#if missing}
    <p class="muted small">{t('follow.missing')}</p>
  {:else}
    <p class="muted small">{t('follow.hint')}</p>
    {#each links as l (l.token)}
      <div class="link-item">
        <div class="row small">
          <span class="label">{t('follow.created', { date: day(l.createdAt) })} <span class="muted">{t('follow.by', { name: maker(l.createdBy) })}</span></span>
          <IconButton icon={icons.copy} label={t('follow.copy')} size={14} onclick={() => copy(l.token)} />
          <IconButton icon={icons.trash} label={t('follow.stop')} size={14} onclick={() => stop(l.token)} />
        </div>
        {#if l.canSuggest !== null}
          <label class="check small" title={t('follow.canSuggestHint')}>
            <input type="checkbox" checked={l.canSuggest} onchange={(e) => toggleSuggest(l.token, e.currentTarget.checked)} />
            <span>{t('follow.canSuggest')}</span>
          </label>
        {/if}
      </div>
    {/each}
    {#if links.some((l) => l.canSuggest === null)}<p class="muted small">{t('follow.suggestMissing')}</p>{/if}
    <button type="button" class="btn" disabled={busy} onclick={create}>{t('follow.create')}</button>
  {/if}
</div>

<style>
  .follow {
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }

  .head {
    font-weight: 600;
  }

  .small {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .muted {
    color: var(--fg-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .row :global(.icon-btn) {
    width: 26px;
    height: 26px;
  }

  .label {
    flex: 1;
  }

  .link-item {
    padding: 4px 0;
    border-top: 1px solid var(--border);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn {
    justify-self: start;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
