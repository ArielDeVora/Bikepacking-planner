<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { t as translate } from '../../core/i18n';
  import { OVERLAY_GROUPS, type LayerManager, type OverlayState } from '../../core/layers';
  import type { BaseMap } from './bases';

  let {
    bases,
    current,
    select,
    layers,
    t,
  }: {
    bases: BaseMap[];
    current: Readable<string>;
    select: (id: string) => void;
    layers: LayerManager;
    t: typeof translate;
  } = $props();

  const overlays = $derived(layers.overlays);
  /** Overlays under their headings; ungrouped ones go with the map's. */
  const groups = $derived(
    OVERLAY_GROUPS.map((g) => ({ id: g, items: $overlays.filter((o: OverlayState) => (o.spec.group ?? 'map') === g) })).filter((g) => g.items.length),
  );
</script>

<fieldset>
  <legend>{t('layers.base')}</legend>
  {#each bases as base (base.id)}
    <label class="row">
      <input type="radio" name="base-map" value={base.id} checked={$current === base.id} onchange={() => select(base.id)} />
      {t(base.label)}
    </label>
  {/each}
</fieldset>

{#each groups as group (group.id)}
  <fieldset>
    <legend>{t(`layers.group.${group.id}`)}</legend>
    {#each group.items as o (o.spec.id)}
      <div class="overlay">
        <label class="row">
          <input
            type="checkbox"
            checked={o.visible}
            onchange={(e) => layers.setOverlay(o.spec.id, { visible: e.currentTarget.checked })}
          />
          {o.spec.label}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={o.opacity}
          disabled={!o.visible}
          aria-label="{t('layers.opacity')}: {o.spec.label}"
          oninput={(e) => layers.setOverlay(o.spec.id, { opacity: Number(e.currentTarget.value) })}
        />
      </div>
    {/each}
  </fieldset>
{/each}

<style>
  fieldset {
    margin: 0 0 12px;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    cursor: pointer;
  }

  .overlay {
    display: grid;
    grid-template-columns: 1fr 110px;
    align-items: center;
    gap: 8px;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }

  input[type='radio'],
  input[type='checkbox'] {
    accent-color: var(--accent);
    margin: 0;
  }
</style>
