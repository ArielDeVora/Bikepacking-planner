<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { routeStages, segmentsOf } from '../../lib/tree';
  import { computeStats } from './stats';
  import StatsTable from './StatsTable.svelte';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const store = $derived(ctx.store);
  const stats = $derived.by(() => {
    void $store;
    const stage = store.get(id, 'stage');
    const stages = stage ? [stage] : routeStages(store, id);
    return computeStats(stages, segmentsOf(store, id), [store.get(id, 'group')?.plannedDate]);
  });
</script>

<section>
  <h3>{ctx.t('stats.title')}</h3>
  <StatsTable t={ctx.t} {stats} showStages={!!store.get(id, 'route')} />
</section>

<style>
  section {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  h3 {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-muted);
  }
</style>
