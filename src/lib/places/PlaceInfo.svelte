<script lang="ts">
  import type { StringKey } from '../../core/i18n';
  import type { ModuleContext } from '../../core/module';
  import type { LngLat } from '../../model/types';
  import { terrain } from '../dem';
  import { describeTags, formatLngLat, placeLinks } from './links';
  import { nearestSegment } from './route';

  let {
    ctx,
    lngLat,
    name,
    osm,
  }: {
    ctx: ModuleContext;
    lngLat: LngLat;
    name: string;
    osm?: { type: 'node' | 'way' | 'relation'; id: number; tags: Record<string, string> };
  } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  let elevation = $state<number | null>(null);
  let copied = $state(false);

  $effect(() => {
    const point = lngLat;
    elevation = null;
    void terrain.sample([point]).then(([e]) => {
      if (point === lngLat && e !== undefined && Number.isFinite(e)) elevation = Math.round(e);
    });
  });

  const nearest = $derived.by(() => {
    void $store;
    return nearestSegment(store, lngLat);
  });
  const tags = $derived(osm ? describeTags(osm.tags) : []);
  const links = $derived(placeLinks(lngLat, name, osm));
  const distance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);

  async function copy() {
    await navigator.clipboard.writeText(formatLngLat(lngLat)).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<dl class="info">
  {#each tags as row (row.key)}
    <div>
      <dt>{t(`place.tag.${row.key}` as StringKey)}</dt>
      <dd>{#if row.href}<a href={row.href} target="_blank" rel="noopener noreferrer">{row.value}</a>{:else}{row.value}{/if}</dd>
    </div>
  {/each}
  <div>
    <dt>{t('place.coordinates')}</dt>
    <dd>
      <button type="button" class="copy" title={t('place.copy')} onclick={copy}>{formatLngLat(lngLat)}</button>
      {#if copied}<span class="muted">{t('place.copied')}</span>{/if}
    </dd>
  </div>
  {#if elevation !== null}
    <div><dt>{t('place.elevation')}</dt><dd>{elevation} m</dd></div>
  {/if}
  {#if nearest}
    <div><dt>{t('place.fromRoute')}</dt><dd>{distance(nearest.distM)} <span class="muted">· {nearest.segment.name}</span></dd></div>
  {/if}
</dl>
<p class="links">
  {#each links as link (link.label)}
    <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
  {/each}
</p>

<style>
  .info {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
    font-size: 13px;
  }

  .info div {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px;
  }

  dt {
    color: var(--fg-muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .copy {
    padding: 0;
    border: 0;
    background: none;
    font-variant-numeric: tabular-nums;
    text-decoration: underline dotted;
    cursor: copy;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
    font-size: 12px;
  }

  a {
    color: var(--accent);
  }
</style>
