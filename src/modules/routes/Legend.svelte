<script lang="ts">
  import type { Readable } from 'svelte/store';
  import { LEG_STATUS_STYLES, MODE_ORDER, MODES, type LineStyle } from '../../config/modes';
  import type { t as translate } from '../../core/i18n';

  let { t, visibleModes }: { t: typeof translate; visibleModes: Readable<string[]> } = $props();

  interface Item {
    id: string;
    label: string;
    style: LineStyle;
  }

  const items = $derived.by((): Item[] => {
    const visible = new Set($visibleModes);
    const list: Item[] = MODE_ORDER.filter((m) => visible.has(m)).map((m) => ({
      id: m,
      label: t(`mode.${m}`),
      style: MODES[m].style,
    }));
    if (visible.has('pending')) list.push({ id: 'pending', label: t('routes.legendPending'), style: LEG_STATUS_STYLES.pending });
    if (visible.has('failed')) list.push({ id: 'failed', label: t('routes.legendFailed'), style: LEG_STATUS_STYLES.failed });
    return list;
  });

  const dash = (style: { width: number; dash?: number[] }) => style.dash?.map((d) => d * style.width).join(' ');
  const cap = (style: LineStyle) => (!style.dash || style.dash[0] === 0 ? 'round' : 'butt');
</script>

{#if items.length}
  <div class="legend" aria-label={t('routes.legend')}>
    {#each items as item (item.id)}
      <div class="item">
        <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
          <line
            x1="3"
            y1="6"
            x2="31"
            y2="6"
            stroke={item.style.color}
            stroke-width={item.style.width}
            stroke-dasharray={dash(item.style)}
            stroke-linecap={cap(item.style)}
            opacity={item.style.opacity ?? 1}
          />
          {#if item.style.overlay}
            <line
              x1="3"
              y1="6"
              x2="31"
              y2="6"
              stroke={item.style.overlay.color}
              stroke-width={item.style.overlay.width}
              stroke-dasharray={dash(item.style.overlay)}
            />
          {/if}
        </svg>
        <span>{item.label}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .legend {
    display: grid;
    gap: 3px;
    padding: 8px 10px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 12px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
