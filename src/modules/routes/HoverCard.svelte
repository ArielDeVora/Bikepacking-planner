<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { Hovered } from './hover';

  let { ctx, hovered }: { ctx: ModuleContext; hovered: Readable<Hovered | null> } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  const info = $derived.by(() => {
    void $store;
    const h = $hovered;
    const seg = h ? store.get(h.segmentId, 'segment') : undefined;
    if (!h || !seg) return null;
    const stage = store.get(seg.stageId, 'stage');
    return { h, seg, stage };
  });

  const km = (m: number) => (m / 1000).toFixed(m < 10_000 ? 1 : 0);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
</script>

{#if info}
  {@const { h, seg, stage } = info}
  <div class="hover" style:left="{h.x + 16}px" style:top="{h.y + 16}px" role="tooltip">
    <div class="title">
      <Icon d={icons[seg.mode]} size={14} />
      <strong>{seg.name}</strong>
    </div>
    {#if stage}<div class="muted">{stage.name}</div>{/if}
    <div>{km(seg.stats.lengthM)} km · ↗ {seg.stats.ascentM} m</div>
    {#if h.dates}
      <div>{h.dates.from === h.dates.to ? day(h.dates.from) : `${day(h.dates.from)} → ${day(h.dates.to)}`}</div>
    {/if}
    <div class="muted small">{t('routes.hoverClick')}</div>
  </div>
{/if}

<style>
  .hover {
    position: fixed;
    z-index: 15;
    max-width: 260px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 12px;
    line-height: 1.45;
    pointer-events: none;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .small {
    font-size: 11px;
  }
</style>
