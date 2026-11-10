<script lang="ts">
  import type { ModuleContext } from '../../core/module';

  let { id, ctx, open }: { id: string; ctx: ModuleContext; open: (focus: string) => void } = $props();
</script>

<p class="history">
  <button type="button" class="link" onclick={() => open(id)}>{ctx.t('history.itemLink')}</button>
</p>

<style>
  .history {
    margin: 6px 0 0;
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
