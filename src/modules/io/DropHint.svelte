<script lang="ts">
  import type { t as translate } from '../../core/i18n';

  let { t }: { t: typeof translate } = $props();
</script>

<div class="drop">
  <strong>{t('io.dropTitle')}</strong>
  <span class="muted">{t('io.dropFormats')}</span>
</div>

<style>
  .drop {
    display: grid;
    gap: 6px;
    place-items: center;
    padding: 40px 10px;
    border: 2px dashed var(--accent);
    border-radius: var(--radius);
    text-align: center;
  }
</style>
