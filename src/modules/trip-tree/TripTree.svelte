<script lang="ts">
  import { LngLatBounds } from 'maplibre-gl';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { timeAgo } from '../../lib/time';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { inTripOrder, mergeManyCommand, moveSegmentsCommand } from '../../lib/segment-edits';
  import type { Entity, Segment, Trip } from '../../model/types';
  import { addStage, deleteStage, moveSegment, moveStage, sortedSegments, sortedStages } from './actions';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);
  const shared = $derived(ctx.cloud.shared);
  const members = $derived(ctx.cloud.members);

  const profile = $derived(ctx.cloud.profile);

  /** Who last changed this entity, in a shared trip. */
  function lastEditor(e: Entity) {
    void $members;
    void $profile;
    if (!$shared || !e.updatedBy) return null;
    const mine = ctx.cloud.isMine(e.updatedBy);
    const p = ctx.cloud.profileOf(e.updatedBy);
    const name = (p?.name || t('collab.someone')) + (mine ? ` (${t('collab.you')})` : '');
    return { color: p?.color ?? 'var(--fg-muted)', title: t('tree.lastEdit', { name, when: timeAgo(t, e.updatedAt) }) };
  }

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

  // Selection: click selects one, Cmd/Ctrl+click adds or removes, Shift+click selects a range.
  let anchorId: string | null = null;
  const flat = $derived(stages.flatMap((st) => [st.id, ...(segmentsByStage.get(st.id) ?? []).map((s) => s.id)]));

  function click(e: MouseEvent, id: string, segs: Segment[]) {
    const type = store.get(id)?.type;
    if (e.metaKey || e.ctrlKey) {
      const current = selection.current;
      selection.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
      anchorId = id;
    } else if (e.shiftKey && anchorId && flat.includes(anchorId)) {
      const [a, b] = [flat.indexOf(anchorId), flat.indexOf(id)].sort((x, y) => x - y);
      selection.set(flat.slice(a!, b! + 1).filter((x) => store.get(x)?.type === type));
    } else {
      anchorId = id;
      select(id, segs);
    }
  }

  // Drag and drop: drop between segments to move them, onto a segment to fuse them into it, onto
  // a stage to move them to its end. Dragging a selected segment drags the whole selection.
  type Where = 'before' | 'after' | 'onto' | 'stage';
  let dragging = $state<string[] | null>(null);
  let target = $state<{ id: string; where: Where } | null>(null);

  function dragStart(e: DragEvent, seg: Segment) {
    const chosen = $selected.includes(seg.id) ? store.list('segment', (s) => $selected.includes(s.id)) : [seg];
    dragging = inTripOrder(store, chosen).map((s) => s.id);
    e.dataTransfer?.setData('text/plain', dragging.join(','));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(e: DragEvent, id: string, isStage: boolean) {
    if (!dragging || dragging.includes(id)) return;
    e.preventDefault();
    let where: Where = 'stage';
    if (!isStage) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      where = y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'onto';
    }
    target = { id, where };
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    const ids = dragging;
    const to = target;
    dragging = null;
    target = null;
    if (!ids || !to) return;
    let cmd = null;
    if (to.where === 'stage') cmd = moveSegmentsCommand(store, ids, to.id, null, t('cmd.moveSegment'));
    else {
      const seg = store.get(to.id, 'segment');
      if (!seg) return;
      if (to.where === 'onto') {
        const moved = ids.map((id) => store.get(id, 'segment')).filter((s): s is Segment => !!s);
        cmd = mergeManyCommand(store, [seg, ...moved], t('cmd.merge'));
      } else {
        const list = (segmentsByStage.get(seg.stageId) ?? []).filter((s) => !ids.includes(s.id));
        const before = to.where === 'before' ? seg.id : (list[list.findIndex((s) => s.id === seg.id) + 1]?.id ?? null);
        cmd = moveSegmentsCommand(store, ids, seg.stageId, before, t('cmd.moveSegment'));
      }
    }
    if (cmd) commands.run(cmd);
  }

  const dropClass = (id: string) => (target?.id === id ? `drop-${target.where}` : '');

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

{#snippet editor(e: Entity)}
  {@const who = lastEditor(e)}
  {#if who}
    <span class="editor" style:background={who.color} title={who.title}></span>
  {/if}
{/snippet}

{#if stages.length === 0}
  <p class="muted">{t('tree.empty')}</p>
{:else}
  <ol>
    {#each stages as stage, i (stage.id)}
      {@const segs = segmentsByStage.get(stage.id) ?? []}
      <li>
        <div
          class="row {dropClass(stage.id)}"
          class:selected={$selected.includes(stage.id)}
          role="treeitem"
          aria-selected={$selected.includes(stage.id)}
          tabindex="-1"
          ondragover={(e) => dragOver(e, stage.id, true)}
          ondragleave={() => target?.id === stage.id && (target = null)}
          ondrop={drop}
        >
          <button type="button" class="name" onclick={(e) => click(e, stage.id, segs)}>
            <span class="swatch" style:background={stage.color ?? 'var(--accent)'}></span>
            <span class="label">{stage.name}</span>
            {@render editor(stage)}
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
              <li
                class="row {dropClass(seg.id)}"
                class:selected={$selected.includes(seg.id)}
                class:dragged={dragging?.includes(seg.id)}
                draggable="true"
                title={t('tree.dragHint')}
                ondragstart={(e) => dragStart(e, seg)}
                ondragover={(e) => dragOver(e, seg.id, false)}
                ondragleave={() => target?.id === seg.id && (target = null)}
                ondrop={drop}
                ondragend={() => ((dragging = null), (target = null))}
              >
                <button type="button" class="name" onclick={(e) => click(e, seg.id, [seg])}>
                  <Icon d={icons[seg.mode]} size={14} />
                  <span class="label">{seg.name}</span>
                  {@render editor(seg)}
                  <span class="km muted">{km([seg])}</span>
                </button>
                <span class="actions">
                  <IconButton icon={icons.up} label={t('tree.moveUp')} size={14} disabled={j === 0 && i === 0} onclick={() => moveSeg(seg.id, -1)} />
                  <IconButton
                    icon={icons.down}
                    label={t('tree.moveDown')}
                    size={14}
                    disabled={j === segs.length - 1 && i === stages.length - 1}
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

  .row.drop-before {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .row.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .row.drop-onto,
  .row.drop-stage {
    background: var(--accent-soft);
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .row.dragged {
    opacity: 0.45;
  }

  li.row[draggable='true'] {
    cursor: grab;
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

  .editor {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px var(--bg);
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
