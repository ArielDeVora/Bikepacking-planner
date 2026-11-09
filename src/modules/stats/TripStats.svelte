<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { computeStats } from './stats';
  import StatsTable from './StatsTable.svelte';

  let { ctx }: { ctx: ModuleContext } = $props();
  const store = $derived(ctx.store);
  const stats = $derived.by(() => {
    void $store;
    return computeStats(store.list('stage'), store.list('segment'));
  });
</script>

<StatsTable t={ctx.t} {stats} showStages />
