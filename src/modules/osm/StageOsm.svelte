<script lang="ts">
  import type { ModuleContext } from '../../core/module';

  let { id, ctx, loadAlong }: { id: string; ctx: ModuleContext; loadAlong: (stageId: string) => Promise<number> } = $props();
  const { t } = $derived(ctx);
  let message = $state('');

  async function run() {
    message = t('osm.alongStarted');
    const tiles = await loadAlong(id);
    message = tiles < 0 ? t('osm.alongNoLayers') : t('osm.alongQueued', { n: tiles });
  }
</script>

<p class="along">
  <button type="button" class="link" onclick={run}>{t('osm.alongStage')}</button>
  {#if message}<span class="muted">{message}</span>{/if}
</p>

<style>
  .along {
    display: grid;
    gap: 2px;
    margin: 6px 0 0;
    font-size: 12px;
  }

  .link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
</style>
