<script lang="ts">
  import { untrack } from 'svelte';
  import type { ModuleContext } from '../../core/module';
  import { ACCEPTED } from './parse';

  let {
    ctx,
    openFiles,
    exportTrip,
    exportBackup,
  }: {
    ctx: ModuleContext;
    openFiles: (files: File[]) => void;
    exportTrip: (activeOnly: boolean) => void;
    exportBackup: () => void;
  } = $props();
  const { t } = $derived(ctx);

  let input: HTMLInputElement;
  let activeOnly = $state(untrack(() => ctx.settings.get('activeOnly', false)));
</script>

<div class="row">
  <button type="button" class="btn" onclick={() => input.click()}>{t('io.importFiles')}</button>
  <span class="muted small">{t('io.orDrop')}</span>
</div>
<input
  bind:this={input}
  type="file"
  multiple
  accept={ACCEPTED}
  hidden
  onchange={(e) => {
    openFiles([...(e.currentTarget.files ?? [])]);
    e.currentTarget.value = '';
  }}
/>

<div class="row">
  <button type="button" class="btn" onclick={() => exportTrip(activeOnly)}>{t('io.exportTripGpx')}</button>
  <button type="button" class="btn" onclick={exportBackup}>{t('io.exportBackup')}</button>
</div>
<label class="check small">
  <input
    type="checkbox"
    bind:checked={activeOnly}
    onchange={() => ctx.settings.set('activeOnly', activeOnly)}
  />
  {t('io.activeOnly')}
</label>
<p class="muted small">{t('io.backupHint')}</p>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .small {
    font-size: 12px;
  }

  .btn {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn:hover {
    background: var(--bg-hover);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  p {
    margin: 8px 0 0;
  }
</style>
