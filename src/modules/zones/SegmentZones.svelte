<script lang="ts">
  import type { ModuleContext } from '../../core/module';
  import { riskZonesCrossed, zonesCrossed } from './crossings';

  let { id, ctx, rerouteSegment }: { id: string; ctx: ModuleContext; rerouteSegment: (segmentId: string) => boolean } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);

  const seg = $derived.by(() => {
    void $store;
    return store.get(id, 'segment');
  });
  const zones = $derived.by(() => {
    void $store;
    return seg ? zonesCrossed(seg, store.list('zone')) : [];
  });
  const risks = $derived.by(() => {
    void $store;
    return seg ? riskZonesCrossed(seg, store.list('zone')) : [];
  });
</script>

{#if seg && zones.length}
  <div class="warn" class:nogo={zones.some((z) => z.severity === 'nogo')}>
    {t('zone.segmentCrosses', { zones: zones.map((z) => `${z.name} (${t(z.severity === 'nogo' ? 'zone.nogo' : 'zone.caution')})`).join(', ') })}
    {#if seg.geomType === 'routed' && zones.some((z) => z.severity === 'nogo')}
      <button type="button" class="link" onclick={() => rerouteSegment(id)}>{t('zone.reroute')}</button>
    {:else if seg.geomType !== 'routed'}
      <span class="muted">{t('zone.manualHint')}</span>
    {/if}
  </div>
{/if}
{#if seg && risks.length}
  <div class="warn risk">{t('zone.segmentRisk', { zones: risks.map((z) => z.name).join(', ') })}</div>
{/if}

<style>
  .warn {
    margin-top: 10px;
    padding: 8px 10px;
    border-left: 3px solid #f08c00;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    font-size: 13px;
  }

  .warn.risk {
    border-left-color: #862e9c;
  }

  .warn.nogo {
    border-left-color: #e03131;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
</style>
