<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import type { Trip } from '../../model/types';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, cloud, trips: tripManager, ui } = $derived(ctx);
  const status = $derived(ctx.cloud.status);
  const account = $derived(ctx.cloud.account);
  const profile = $derived(ctx.cloud.profile);
  const members = $derived(ctx.cloud.members);
  const online = $derived(ctx.cloud.online);
  const shared = $derived(ctx.cloud.shared);
  const role = $derived(ctx.cloud.role);
  const remoteTrips = $derived(ctx.cloud.trips);
  const lastError = $derived(ctx.cloud.lastError);
  const store = $derived(ctx.store);

  let email = $state('');
  let sentTo = $state('');
  let busy = $state(false);
  let localTrips = $state<Trip[]>([]);

  $effect(() => {
    void tripManager.listLocal().then((list) => (localTrips = list));
  });

  const currentName = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip')?.name ?? '';
  });

  const tripList = $derived.by(() => {
    const byId = new Map<string, { id: string; name: string; shared: boolean }>();
    for (const tr of localTrips) byId.set(tr.id, { id: tr.id, name: tr.name, shared: false });
    for (const tr of $remoteTrips) byId.set(tr.id, { id: tr.id, name: tr.name || byId.get(tr.id)?.name || '', shared: true });
    const current = byId.get(ctx.tripId);
    if (current) current.name = currentName || current.name;
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  const statusText = $derived.by(() => {
    switch ($status) {
      case 'starting':
        return t('collab.status.starting');
      case 'syncing':
        return t('collab.status.syncing');
      case 'synced':
        return t('collab.status.synced');
      case 'denied':
        return t('collab.status.denied');
      case 'offline':
        return navigator.onLine ? t('collab.status.unreachable') : t('collab.status.offline');
      default:
        return '';
    }
  });

  const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

  async function sendLink(e: SubmitEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    busy = true;
    try {
      await cloud.signIn(email.trim());
      sentTo = email.trim();
    } catch (err) {
      ui.notify(t('collab.signInFailed', { reason: reason(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  let code = $state('');
  async function signInWithCode(e: SubmitEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    busy = true;
    try {
      await cloud.verifyCode(sentTo, code);
    } catch (err) {
      ui.notify(t('collab.codeFailed', { reason: reason(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  async function share() {
    busy = true;
    try {
      await cloud.shareTrip();
    } catch (err) {
      ui.notify(t('collab.shareFailed', { reason: reason(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  async function invite() {
    try {
      const url = await cloud.createInvite();
      // The clipboard is only available over HTTPS (or localhost).
      if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => window.prompt(t('collab.invite'), url));
      else window.prompt(t('collab.invite'), url);
      ui.notify(t('collab.inviteCopied'));
    } catch (err) {
      ui.notify(t('collab.inviteFailed', { reason: reason(err) }), 'error');
    }
  }

  function saveProfile(patch: { name?: string; color?: string }) {
    cloud.saveProfile(patch).catch((err) => ui.notify(reason(err), 'error'));
  }
</script>

{#if !cloud.configured}
  <p class="muted small">{t('collab.notConfigured')}</p>
{:else if $status === 'starting'}
  <p class="muted small">{t('collab.status.starting')}</p>
{:else if !$account}
  {#if sentTo}
    <p class="small">{t('collab.linkSent', { email: sentTo })}</p>
    <form class="signin" onsubmit={signInWithCode}>
      <input
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        placeholder={t('collab.code')}
        aria-label={t('collab.code')}
        bind:value={code}
      />
      <button type="submit" class="btn primary" disabled={busy || !code.trim()}>{t('collab.signInCode')}</button>
    </form>
    <button type="button" class="link small" onclick={() => ((sentTo = ''), (code = ''))}>{t('collab.otherEmail')}</button>
  {:else}
    <p class="muted small">{cloud.hasPendingInvite() ? t('collab.inviteWaiting') : t('collab.signInIntro')}</p>
    <form class="signin" onsubmit={sendLink}>
      <input type="email" required placeholder={t('collab.email')} aria-label={t('collab.email')} bind:value={email} />
      <button type="submit" class="btn primary" disabled={busy}>{t('collab.sendLink')}</button>
    </form>
  {/if}
{:else}
  <div class="me">
    <input
      type="color"
      class="swatch-input"
      value={$profile?.color ?? '#e8590c'}
      aria-label={t('collab.yourColor')}
      onchange={(e) => saveProfile({ color: e.currentTarget.value })}
    />
    <input
      type="text"
      value={$profile?.name ?? ''}
      aria-label={t('collab.yourName')}
      placeholder={t('collab.yourName')}
      onchange={(e) => saveProfile({ name: e.currentTarget.value.trim() })}
    />
    <button type="button" class="btn" onclick={() => cloud.signOut()}>{t('collab.signOut')}</button>
  </div>
  <p class="muted small email">{$account.email}</p>

  {#if $shared}
    <p class="small status" class:warn={$status === 'offline' || $status === 'denied'} title={$lastError ?? ''}>{statusText}</p>
    <div class="list-head muted small">{t('collab.members')}</div>
    <ul class="members">
      {#each $members as m (m.id)}
        <li>
          <span class="dot" style:background={m.color}></span>
          <span class="label">{m.name || t('collab.someone')}{cloud.isMine(m.id) ? ` (${t('collab.you')})` : ''}</span>
          {#if m.role === 'owner'}<span class="tag">{t('collab.owner')}</span>{/if}
          {#if $online.includes(m.id)}<span class="online" title={t('collab.online')}></span>{/if}
        </li>
      {/each}
    </ul>
    {#if $role === 'owner'}
      <button type="button" class="btn" onclick={invite}>{t('collab.invite')}</button>
    {/if}
  {:else}
    <p class="muted small">{t('collab.shareHint')}</p>
    <button type="button" class="btn primary" disabled={busy} onclick={share}>{t('collab.shareTrip')}</button>
  {/if}
{/if}

<div class="list-head muted small trips-head">
  <span>{t('collab.trips')}</span>
  <button type="button" class="link" onclick={() => tripManager.create()}>{t('collab.newTrip')}</button>
</div>
<ul class="trips">
  {#each tripList as trip (trip.id)}
    <li>
      <button type="button" class="trip" disabled={trip.id === ctx.tripId} onclick={() => tripManager.open(trip.id)}>
        <span class="label">{trip.name || t('trip.defaultName')}</span>
        {#if trip.shared}<span class="tag">{t('collab.sharedTag')}</span>{/if}
        {#if trip.id === ctx.tripId}<span class="tag current">{t('collab.open')}</span>{/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .small {
    font-size: 12px;
    line-height: 1.4;
  }

  .signin {
    display: grid;
    gap: 6px;
  }

  input[type='email'] {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .btn {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
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

  .me {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .swatch-input {
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .email {
    margin: 4px 0 8px;
  }

  .status {
    margin: 0 0 8px;
  }

  .warn {
    color: var(--warn);
  }

  .list-head {
    display: flex;
    justify-content: space-between;
    margin: 10px 0 4px;
  }

  ul {
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }

  .members li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--bg-sunken);
    color: var(--fg-muted);
    font-size: 11px;
  }

  .tag.current {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .online {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2f9e44;
  }

  .trip {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .trip:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .trip:disabled {
    cursor: default;
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
