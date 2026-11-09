<script lang="ts">
  import { LngLatBounds } from 'maplibre-gl';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Segment, Trip } from '../../model/types';
  import { addStage, deleteStage, moveSegment, moveStage, sortedSegments, sortedStages } from './actions';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);

  const trip = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip');
  });
  const stages = $derived.by(() => {
    void $store;
    return sortedStages(store);
  });

  const segmentsByStage = $derived.by(() => {
    void $store;
    return new Map(stages.map((st) => [st.id, sortedSegments(store, st.id)]));
  });

  const km = (segs: Segment[]) => {
    const m = segs.reduce((sum, s) => sum + s.stats.lengthM, 0);
    return m ? `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km` : '';
  };

  /** Selects an entity and brings its segments into view if they are off screen. */
  function select(id: string, segs: Segment[]) {
    selection.set([id]);
    const bounds = new LngLatBounds();
    for (const s of segs) for (const a of s.anchors) bounds.extend(a.lngLat);
    if (bounds.isEmpty()) return;
    const view = ctx.map.getBounds();
    if (view.contains(bounds.getSouthWest()) && view.contains(bounds.getNorthEast())) return;
    const wide = window.innerWidth > 640;
    ctx.map.fitBounds(bounds, {
      padding: { top: 60, bottom: 60, left: wide ? 380 : 40, right: wide ? 340 : 40 },
      maxZoom: 14,
    });
  }

  function add() {
    const cmd = addStage(store, ctx.tripId, t('tree.stageName', { n: stages.length + 1 }), t('cmd.addStage'));
    commands.run(cmd);
    selection.set([cmd.changes[0]!.id]);
  }

  function move(id: string, dir: -1 | 1) {
    const cmd = moveStage(store, id, dir, t('cmd.moveStage'));
    if (cmd) commands.run(cmd);
  }

  function moveSeg(id: string, dir: -1 | 1) {
    const cmd = moveSegment(store, id, dir, t('cmd.moveSegment'));
    if (cmd) commands.run(cmd);
  }

  function renameTrip(name: string) {
    if (!trip || !name.trim() || name === trip.name) return;
    commands.run({ label: t('cmd.renameTrip'), changes: [edits.update<Trip>(store, trip.id, { name: name.trim() })] });
  }
</script>

{#if trip}
  <input
    class="trip-name"
    type="text"
    value={trip.name}
    aria-label="Trip name"
    onchange={(e) => renameTrip(e.currentTarget.value)}
  />
{/if}

<div class="list-head">
  <span class="muted">{t('tree.stages')}</span>
  <IconButton icon={icons.plus} label={t('tree.addStage')} size={16} onclick={add} />
</div>

{#if stages.length === 0}
  <p class="muted">{t('tree.empty')}</p>
{:else}
  <ol>
    {#each stages as stage, i (stage.id)}
      {@const segs = segmentsByStage.get(stage.id) ?? []}
      <li>
        <div class="row" class:selected={$selected.includes(stage.id)}>
          <button type="button" class="name" onclick={() => select(stage.id, segs)}>
            <span class="swatch" style:background={stage.color ?? 'var(--accent)'}></span>
            <span class="label">{stage.name}</span>
            <span class="km muted">{km(segs)}</span>
          </button>
          <span class="actions">
            <IconButton icon={icons.up} label={t('tree.moveUp')} size={14} disabled={i === 0} onclick={() => move(stage.id, -1)} />
            <IconButton
              icon={icons.down}
              label={t('tree.moveDown')}
              size={14}
              disabled={i === stages.length - 1}
              onclick={() => move(stage.id, 1)}
            />
            <IconButton
              icon={icons.trash}
              label={t('tree.delete')}
              size={14}
              onclick={() => commands.run(deleteStage(store, stage.id, t('cmd.deleteStage')))}
            />
          </span>
        </div>
        {#if segs.length}
          <ol class="segments">
            {#each segs as seg, j (seg.id)}
              <li class="row" class:selected={$selected.includes(seg.id)}>
                <button type="button" class="name" onclick={() => select(seg.id, [seg])}>
                  <Icon d={icons[seg.mode]} size={14} />
                  <span class="label">{seg.name}</span>
                  <span class="km muted">{km([seg])}</span>
                </button>
                <span class="actions">
                  <IconButton icon={icons.up} label={t('tree.moveUp')} size={14} disabled={j === 0} onclick={() => moveSeg(seg.id, -1)} />
                  <IconButton
                    icon={icons.down}
                    label={t('tree.moveDown')}
                    size={14}
                    disabled={j === segs.length - 1}
                    onclick={() => moveSeg(seg.id, 1)}
                  />
                  <IconButton
                    icon={icons.trash}
                    label={t('tree.delete')}
                    size={14}
                    onclick={() => commands.run({ label: t('cmd.deleteSegment'), changes: [edits.remove(store, seg.id)] })}
                  />
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </li>
    {/each}
  </ol>
  {#if ![...segmentsByStage.values()].some((segs) => segs.length)}
    <p class="muted hint">{t('tree.noSegments')}</p>
  {/if}
{/if}

<style>
  .trip-name {
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 15px;
    border-color: transparent;
    background: transparent;
    padding-left: 4px;
  }

  .trip-name:hover,
  .trip-name:focus {
    border-color: var(--border);
    background: var(--bg);
  }

  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  ol {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.selected {
    background: var(--accent-soft);
  }

  .segments {
    margin: 0 0 4px 14px;
  }

  .segments .name {
    padding: 4px;
    font-size: 13px;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .km {
    flex: none;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    font-size: 12px;
  }

  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 4px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .actions {
    display: flex;
    opacity: 0;
  }

  .row:hover .actions,
  .row:focus-within .actions,
  .row.selected .actions {
    opacity: 1;
  }

  .actions :global(.icon-btn) {
    width: 26px;
    height: 26px;
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }
  }
</style>
