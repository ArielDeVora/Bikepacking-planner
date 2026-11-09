<script lang="ts">
  import type { StringKey } from '../../core/i18n';
  import type { ModuleContext } from '../../core/module';
  import type { LngLat } from '../../model/types';
  import { terrain } from '../dem';
  import { osmDetails, wikiSummary, type OsmDetails, type WikiSummary } from './details';
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
  let fetched = $state<OsmDetails | null>(null);
  let summary = $state<WikiSummary | null>(null);

  // Full tags and a Wikipedia summary, fetched when the card opens.
  $effect(() => {
    const ref = osm;
    fetched = null;
    summary = null;
    if (!ref) return;
    let live = true;
    void osmDetails(ref.type, ref.id).then(async (d) => {
      if (!live) return;
      fetched = d;
      const s = await wikiSummary({ ...ref.tags, ...(d?.tags ?? {}) });
      if (live) summary = s;
    });
    return () => {
      live = false;
    };
  });

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
  const allTags = $derived({ ...(osm?.tags ?? {}), ...(fetched?.tags ?? {}) });
  const tags = $derived.by(() => {
    const rows = describeTags(allTags);
    if (fetched?.address && !rows.some((r) => r.key === 'address')) rows.unshift({ key: 'address', value: fetched.address });
    return rows;
  });
  const links = $derived(placeLinks(lngLat, name, osm ? { ...osm, tags: allTags } : undefined));
  const distance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);

  async function copy() {
    await navigator.clipboard.writeText(formatLngLat(lngLat)).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

{#if summary}
  <div class="summary">
    {#if summary.image}<img src={summary.image} alt={summary.title} loading="lazy" />{/if}
    <p>{summary.extract}</p>
    <a href={summary.url} target="_blank" rel="noopener noreferrer">{t('place.readMore')}</a>
  </div>
{/if}

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
  .summary {
    margin: 0 0 10px;
    font-size: 13px;
  }

  .summary img {
    display: block;
    width: 100%;
    max-height: 160px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    margin-bottom: 6px;
  }

  .summary p {
    margin: 0 0 4px;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

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
