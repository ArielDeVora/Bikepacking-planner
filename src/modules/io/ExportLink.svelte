<script lang="ts">
  import type { ModuleContext } from '../../core/module';

  let { id, ctx, exportGpx }: { id: string; ctx: ModuleContext; exportGpx: (id: string) => void } = $props();
</script>

<p class="export">
  <button type="button" class="link" onclick={() => exportGpx(id)}>{ctx.t('io.exportGpx')}</button>
</p>

<style>
  .export {
    margin: 8px 0 0;
    font-size: 12px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
</style>
