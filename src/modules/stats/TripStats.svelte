<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { routeSegments, routeStages, sortedRoutes } from '../../lib/tree';
  import { computeStats } from './stats';
  import StatsTable from './StatsTable.svelte';

  let { ctx }: { ctx: ModuleContext } = $props();
  const store = $derived(ctx.store);
  const t = $derived(ctx.t);
  const stats = $derived.by(() => {
    void $store;
    return computeStats(store.list('stage'), store.list('segment'));
  });
  // Routes are alternatives: compare them side by side.
  const routes = $derived.by(() => {
    void $store;
    return sortedRoutes(store).map((r) => ({ route: r, stats: computeStats(routeStages(store, r.id), routeSegments(store, r.id)) }));
  });
  const km = (m: number) => (m / 1000).toFixed(m < 100_000 ? 1 : 0);
</script>

{#if routes.length}
  <table class="routes">
    <thead>
      <tr><th>{t('stats.byRoute')}</th><th class="num">km</th><th class="num">↗ m</th><th class="num">{t('stats.stages')}</th></tr>
    </thead>
    <tbody>
      {#each routes as { route, stats: s } (route.id)}
        <tr>
          <td>
            <button type="button" class="link" onclick={() => ctx.selection.set([route.id])}>
              <span class="swatch" style:background={route.color ?? 'var(--fg-muted)'}></span>{route.name}
            </button>
          </td>
          <td class="num">{km(s.lengthM)}</td>
          <td class="num">{s.ascentM.toLocaleString()}</td>
          <td class="num">{s.stages}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="muted small">{t('stats.allRoutes')}</p>
{/if}
<StatsTable {t} {stats} showStages />

<style>
  .routes {
    width: 100%;
    margin-bottom: 4px;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    padding: 2px 0;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    color: var(--fg-muted);
  }

  td {
    padding: 3px 0;
  }

  .num {
    padding-left: 8px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }

  .link:hover {
    color: var(--accent);
  }

  .swatch {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .small {
    margin: 0 0 8px;
    font-size: 12px;
  }
</style>
