<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { fcdoAdvice, usAdvisories, type FcdoAdvice, type UsAdvisory } from './advisories';

  let { ctx, country }: { ctx: ModuleContext; country: { code: string; name: string } } = $props();
  const { t } = $derived(ctx);

  let us = $state<UsAdvisory | null | undefined>(undefined);
  let usDate = $state('');
  let uk = $state<FcdoAdvice | null | undefined>(undefined);

  $effect(() => {
    const c = country;
    us = undefined;
    uk = undefined;
    void usAdvisories().then((d) => {
      if (c !== country) return;
      us = d?.lookup(c.name) ?? null;
      usDate = d?.fetchedAt ?? '';
    });
    void fcdoAdvice(c.name)
      .then((a) => c === country && (uk = a))
      .catch(() => c === country && (uk = null));
  });

  const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : '');
</script>

<h3>{country.name}</h3>

<section>
  <h4>{t('risk.uk')}</h4>
  {#if uk === undefined}
    <p class="muted small">{t('risk.loading')}</p>
  {:else if uk === null}
    <p class="muted small">{t('risk.ukUnavailable')}</p>
  {:else}
    {#if uk.alerts.length}
      {#each uk.alerts as a (a)}<p class="alert {a.includes('whole') ? 'high' : 'mid'}">{t(`risk.alert.${a}`)}</p>{/each}
    {:else}
      <p class="alert ok">{t('risk.alert.none')}</p>
    {/if}
    {#if uk.areas.length}
      <p class="small">{t('risk.areas')}</p>
      <ul class="small">
        {#each uk.areas as area (area)}<li>{area}</li>{/each}
      </ul>
    {/if}
    {#if uk.mapImage}
      <a href={uk.mapImage} target="_blank" rel="noopener noreferrer"><img src={uk.mapImage} alt={t('risk.ukMap', { country: uk.country })} loading="lazy" /></a>
    {/if}
    <p class="small"><a href={uk.url} target="_blank" rel="noopener noreferrer">{t('risk.readUk')}</a> <span class="muted">· {t('risk.updated', { date: day(uk.updated) })}</span></p>
  {/if}
</section>

<section>
  <h4>{t('risk.us')}</h4>
  {#if us === undefined}
    <p class="muted small">{t('risk.loading')}</p>
  {:else if us === null}
    <p class="muted small">{t('risk.usUnavailable')}</p>
  {:else}
    <p class="alert level{us.level}">{t('risk.level', { n: us.level })} · {t(`risk.level.${us.level}` as 'risk.level.1')}</p>
    <p class="small"><a href={us.url} target="_blank" rel="noopener noreferrer">{t('risk.readUs')}</a> <span class="muted">· {t('risk.updated', { date: day(us.updated) })}</span></p>
  {/if}
</section>

<section>
  <h4>{t('risk.fr')}</h4>
  <p class="small">
    <a href="https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/" target="_blank" rel="noopener noreferrer">{t('risk.readFr')}</a>
  </p>
</section>

<p class="disclaimer">{t('risk.disclaimer', { date: day(usDate) || '—' })}</p>

<style>
  h3 {
    margin: 0 28px 8px 0;
    font-size: 15px;
  }

  h4 {
    margin: 10px 0 4px;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .small {
    font-size: 12px;
    margin: 4px 0;
  }

  ul {
    margin: 2px 0 6px;
    padding-left: 18px;
  }

  .alert {
    margin: 2px 0;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
  }

  .alert.ok,
  .alert.level1 {
    background: #ebfbee;
    color: #2b8a3e;
  }

  .alert.level2 {
    background: #fff9db;
    color: #946200;
  }

  .alert.mid,
  .alert.level3 {
    background: #fff4e6;
    color: #d9480f;
  }

  .alert.high,
  .alert.level4 {
    background: #ffe3e3;
    color: #c92a2a;
  }

  img {
    display: block;
    width: 100%;
    margin: 6px 0;
    border-radius: var(--radius-sm);
  }

  a {
    color: var(--accent);
  }

  .disclaimer {
    margin: 12px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--fg-muted);
  }
</style>
