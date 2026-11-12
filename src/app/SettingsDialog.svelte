<script lang="ts">
  import type { Core } from '../core/core';
  import type { PlaceNames, Preferences } from '../core/preferences';
  import type { ThemeMode } from '../core/theme';
  import { clearTiles, savedTiles } from '../modules/offline/download';
  import { brouter } from '../modules/routes/routing/brouter';

  let { core }: { core: Core } = $props();
  const { t, prefs } = $derived(core);
  const mode = $derived(core.theme.mode);

  const bikeProfiles = brouter.profiles.bike ?? [];
  const NAMES: PlaceNames[] = ['zoomed', 'always', 'never'];
  const THEMES: ThemeMode[] = ['system', 'light', 'dark'];

  const sizes: { key: 'placeSize' | 'osmPlaceSize' | 'routeWidth'; min: number; max: number; hint: string; label: string }[] = $derived([
    { key: 'placeSize', min: 0.6, max: 1.8, label: t('settings.placeSize'), hint: t('settings.placeSizeHint') },
    { key: 'osmPlaceSize', min: 0.6, max: 1.8, label: t('settings.osmPlaceSize'), hint: t('settings.osmPlaceSizeHint') },
  ]);

  const percent = (v: number) => `${Math.round(v * 100)} %`;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => prefs.set(key, value);

  // Offline: map tiles kept on this device.
  let offline = $state<{ count: number; bytes: number | null } | null>(null);
  $effect(() => {
    savedTiles().then((s) => (offline = s));
  });
  async function clearOffline() {
    await clearTiles();
    offline = await savedTiles();
  }

  function reset() {
    prefs.reset();
    core.theme.setMode('system');
  }
</script>

<div class="settings dialog-sized">
  <h2>{t('settings.title')}</h2>

  <section>
    <h3>{t('settings.map')}</h3>
    {#each sizes as s (s.key)}
      <label class="row">
        <span class="text">
          <span>{s.label}</span>
          <span class="hint">{s.hint}</span>
        </span>
        <span class="control">
          <input
            type="range"
            min={s.min}
            max={s.max}
            step="0.1"
            value={$prefs[s.key]}
            oninput={(e) => set(s.key, Number(e.currentTarget.value))}
          />
          <output>{percent($prefs[s.key])}</output>
        </span>
      </label>
    {/each}
    <div class="row">
      <span class="text"><span>{t('settings.placeNames')}</span></span>
      <span class="seg" role="radiogroup" aria-label={t('settings.placeNames')}>
        {#each NAMES as n (n)}
          <button type="button" role="radio" aria-checked={$prefs.placeNames === n} class:on={$prefs.placeNames === n} onclick={() => set('placeNames', n)}>
            {t(`settings.names.${n}`)}
          </button>
        {/each}
      </span>
    </div>
    <label class="row check">
      <input type="checkbox" checked={$prefs.placeAuthors} onchange={(e) => set('placeAuthors', e.currentTarget.checked)} />
      <span class="text">
        <span>{t('settings.placeAuthors')}</span>
        <span class="hint">{t('settings.placeAuthorsHint')}</span>
      </span>
    </label>
  </section>

  <section>
    <h3>{t('settings.routes')}</h3>
    <label class="row">
      <span class="text">
        <span>{t('settings.routeWidth')}</span>
        <span class="hint">{t('settings.routeWidthHint')}</span>
      </span>
      <span class="control">
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.1"
          value={$prefs.routeWidth}
          oninput={(e) => set('routeWidth', Number(e.currentTarget.value))}
        />
        <output>{percent($prefs.routeWidth)}</output>
      </span>
    </label>
    <label class="row">
      <span class="text">
        <span>{t('settings.bikeProfile')}</span>
        <span class="hint">{t('settings.bikeProfileHint')}</span>
      </span>
      <select value={$prefs.bikeProfile ?? ''} onchange={(e) => set('bikeProfile', e.currentTarget.value || null)}>
        {#each bikeProfiles as p, i (p.id)}
          <option value={i === 0 ? '' : p.id}>{i === 0 ? t('settings.defaultProfile', { name: p.label }) : p.label}</option>
        {/each}
      </select>
    </label>
  </section>

  <section>
    <h3>{t('settings.appearance')}</h3>
    <div class="row">
      <span class="text"><span>{t('settings.theme')}</span></span>
      <span class="seg" role="radiogroup" aria-label={t('settings.theme')}>
        {#each THEMES as m (m)}
          <button type="button" role="radio" aria-checked={$mode === m} class:on={$mode === m} onclick={() => core.theme.setMode(m)}>
            {t(`settings.theme.${m}`)}
          </button>
        {/each}
      </span>
    </div>
  </section>

  <section>
    <h3>{t('settings.offline')}</h3>
    <div class="row">
      <span class="text">
        <span class="hint">
          {offline?.count ? t('settings.offlineTiles', { n: offline.count, mb: offline.bytes ? Math.round(offline.bytes / 1024 / 1024) : '?' }) : t('settings.offlineNone')}
        </span>
      </span>
      {#if offline?.count}<button type="button" class="btn" onclick={clearOffline}>{t('settings.offlineClear')}</button>{/if}
    </div>
  </section>

  <section>
    <h3>{t('settings.updates')}</h3>
    <label class="row check">
      <input type="checkbox" checked={$prefs.undoNotices} onchange={(e) => set('undoNotices', e.currentTarget.checked)} />
      <span>{t('settings.undoNotices')}</span>
    </label>
    <label class="row check">
      <input type="checkbox" checked={$prefs.whatsNew} onchange={(e) => set('whatsNew', e.currentTarget.checked)} />
      <span>{t('settings.whatsNew')}</span>
    </label>
  </section>

  <div class="buttons">
    <button type="button" class="btn" onclick={reset}>{t('settings.reset')}</button>
    <span class="muted saved">{t('settings.saved')}</span>
    <button type="button" class="btn primary" onclick={() => core.ui.closeDialog()}>{t('settings.done')}</button>
  </div>
</div>

<style>
  .settings {
    width: min(560px, calc(100vw - 72px));
  }

  h2 {
    margin: 0 0 6px;
    font-size: 16px;
  }

  section {
    padding: 10px 0 4px;
    border-bottom: 1px solid var(--border);
  }

  h3 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 0;
  }

  .row.check {
    justify-content: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .hint {
    font-size: 12px;
    color: var(--fg-muted);
  }

  .control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  input[type='range'] {
    width: 150px;
    accent-color: var(--accent);
  }

  input[type='checkbox'] {
    accent-color: var(--accent);
  }

  output {
    width: 44px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-size: 12px;
    color: var(--fg-muted);
  }

  select {
    flex: none;
    max-width: 200px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  .seg {
    display: inline-flex;
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg button {
    padding: 5px 10px;
    border: 0;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
  }

  .saved {
    flex: 1;
    font-size: 12px;
    text-align: right;
  }

  .btn {
    padding: 6px 14px;
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

  @media (max-width: 640px) {
    .row:not(.check) {
      flex-wrap: wrap;
    }
  }
</style>
