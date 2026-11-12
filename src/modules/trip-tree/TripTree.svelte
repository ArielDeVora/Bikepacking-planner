<script lang="ts">
  import { isPhone } from '../../lib/ui/phone';
  import { LngLatBounds } from 'maplibre-gl';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { timeAgo } from '../../lib/time';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { deleteGroupCommand, inTripOrder, moveIntoCommand, ungroupCommand, type Container } from '../../lib/segment-edits';
  import { fuseAction } from '../../lib/segment-actions';
  import {
    groupSegments,
    inGroup,
    inRoute,
    routeOf,
    routeStages,
    siblingsOf,
    sortedStages,
    stageChildren,
    stageSiblings,
    tripChildren,
    type StageChild,
    type TripChild,
  } from '../../lib/tree';
  import { addRouteCommand, addStageCommand, deleteRouteCommand, dissolveRouteCommand, moveTopCommand } from '../../lib/route-edits';
  import type { Entity, Group, Route, Segment, Stage, Trip } from '../../model/types';
  import { untrack } from 'svelte';
  import { editedAt, editedBy } from '../../model/edited';
  import { deleteStage } from './actions';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);
  // What's selected (e.g. clicked on the map) is scrolled into view in the list.
  let listEl = $state<HTMLElement>();
  $effect(() => {
    const id = $selected.at(-1);
    if (!id || !listEl) return;
    requestAnimationFrame(() => listEl?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });
  const hidden = $derived(ctx.visibility.hidden);

  // Collapsed stages and groups (contents not listed), remembered per trip in this browser.
  const collapseKey = untrack(() => `collapsed:${ctx.tripId}`);
  let collapsed = $state(new Set<string>(untrack(() => ctx.settings.get<string[]>(collapseKey, []))));
  function setCollapsed(ids: string[], on: boolean) {
    const next = new Set(collapsed);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    collapsed = next;
    ctx.settings.set(collapseKey, [...next]);
  }
  const shared = $derived(ctx.cloud.shared);
  const members = $derived(ctx.cloud.members);

  const profile = $derived(ctx.cloud.profile);

  /** Who last changed this entity, in a shared trip. */
  function lastEditor(e: Entity) {
    void $members;
    void $profile;
    const by = editedBy(e);
    if (!$shared || !by) return null;
    const mine = ctx.cloud.isMine(by);
    const p = ctx.cloud.profileOf(by);
    const name = (p?.name || t('collab.someone')) + (mine ? ` (${t('collab.you')})` : '');
    return { color: p?.color ?? 'var(--fg-muted)', title: t('tree.lastEdit', { name, when: timeAgo(t, editedAt(e)) }) };
  }

  const trip = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip');
  });
  const stages = $derived.by(() => {
    void $store;
    return sortedStages(store);
  });
  /** Routes and the stages that aren't in a route, in order. */
  const top = $derived.by(() => {
    void $store;
    return tripChildren(store);
  });
  const stagesByRoute = $derived.by(() => {
    void $store;
    return new Map(top.filter((c) => c.type === 'route').map((r) => [r.id, routeStages(store, r.id)]));
  });

  /** Each stage's groups and ungrouped segments, in order. */
  const childrenByStage = $derived.by(() => {
    void $store;
    return new Map(stages.map((st) => [st.id, stageChildren(store, st.id)]));
  });
  const segmentsByGroup = $derived.by(() => {
    const map = new Map<string, Segment[]>();
    for (const list of childrenByStage.values()) for (const c of list) if (c.type === 'group') map.set(c.id, groupSegments(store, c.id));
    return map;
  });
  const childSegments = (c: StageChild): Segment[] => (c.type === 'group' ? (segmentsByGroup.get(c.id) ?? []) : [c]);
  const segmentsByStage = $derived(new Map(stages.map((st) => [st.id, (childrenByStage.get(st.id) ?? []).flatMap(childSegments)])));
  const routeSegs = (id: string) => (stagesByRoute.get(id) ?? []).flatMap((st) => segmentsByStage.get(st.id) ?? []);

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
    const wide = !isPhone();
    // On phones the details sheet opens over the bottom half of the map.
    ctx.map.fitBounds(bounds, {
      padding: { top: 60, bottom: wide ? 60 : Math.round(window.innerHeight * 0.5) + 30, left: wide ? 380 : 40, right: wide ? 340 : 60 },
      maxZoom: 14,
    });
  }

  // Selection: click selects one, Cmd/Ctrl+click adds or removes, Shift+click selects a range.
  let anchorId: string | null = null;
  const stageFlat = (st: Stage) => [
    st.id,
    ...(childrenByStage.get(st.id) ?? []).flatMap((c) => (c.type === 'group' ? [c.id, ...childSegments(c).map((s) => s.id)] : [c.id])),
  ];
  const flat = $derived(top.flatMap((c) => (c.type === 'route' ? [c.id, ...(stagesByRoute.get(c.id) ?? []).flatMap(stageFlat)] : stageFlat(c))));

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

  // Drag and drop. Segments: between two items to move them there, onto a segment to fuse them
  // into it, onto a group or a stage to move them to its end. Groups: between the items of a
  // stage, or onto a stage. Stages: between other stages (in a route or not), or onto a route.
  // Routes: between the routes and loose stages. Dragging a selected item drags every selected
  // item of its kind.
  type Kind = 'segment' | 'group' | 'stage' | 'route';
  type Where = 'before' | 'after' | 'onto' | 'into';
  let dragging = $state<string[] | null>(null);
  let dragKind: Kind = 'segment';
  let target = $state<{ id: string; where: Where } | null>(null);

  function startDrag(e: DragEvent, kind: Kind, ids: string[]) {
    e.stopPropagation();
    dragKind = kind;
    dragging = ids;
    e.dataTransfer?.setData('text/plain', ids.join(','));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function dragStart(e: DragEvent, seg: Segment) {
    const chosen = $selected.includes(seg.id) ? store.list('segment', (s) => $selected.includes(s.id)) : [seg];
    startDrag(e, 'segment', inTripOrder(store, chosen).map((s) => s.id));
  }

  function dragGroupStart(e: DragEvent, id: string) {
    startDrag(e, 'group', $selected.includes(id) ? flat.filter((x) => $selected.includes(x) && store.get(x, 'group')) : [id]);
  }

  function dragStageStart(e: DragEvent, id: string) {
    startDrag(e, 'stage', $selected.includes(id) ? stages.filter((s) => $selected.includes(s.id)).map((s) => s.id) : [id]);
  }

  function dragRouteStart(e: DragEvent, id: string) {
    startDrag(e, 'route', $selected.includes(id) ? top.filter((c) => c.type === 'route' && $selected.includes(c.id)).map((c) => c.id) : [id]);
  }

  function dragOver(e: DragEvent, id: string, row: Kind) {
    if (!dragging || dragging.includes(id)) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const edge: Where = y < 0.5 ? 'before' : 'after';
    let where: Where | null = null;
    if (dragKind === 'route') {
      const stage = row === 'stage' ? store.get(id, 'stage') : undefined;
      where = row === 'route' || (stage && !inRoute(store, stage)) ? edge : null;
    } else if (dragKind === 'stage') where = row === 'stage' ? edge : row === 'route' ? (y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'into') : null;
    else if (row === 'route') where = null;
    else if (row === 'stage') where = 'into';
    else if (dragKind === 'group') {
      const seg = row === 'segment' ? store.get(id, 'segment') : undefined;
      where = seg && inGroup(store, seg) ? null : edge;
    } else where = y < 0.3 ? 'before' : y > 0.7 ? 'after' : row === 'group' ? 'into' : 'onto';
    if (!where) return;
    e.preventDefault();
    e.stopPropagation();
    target = { id, where };
  }

  /** Moves stages or routes next to `nextTo` in `list` (the items of the route, or of the trip). */
  function placeTop(ids: string[], routeId: string | undefined, list: TripChild[], nextTo: string, where: Where, label: string) {
    const rest = list.filter((c) => !ids.includes(c.id));
    const before = where === 'before' ? nextTo : (rest[rest.findIndex((c) => c.id === nextTo) + 1]?.id ?? null);
    return moveTopCommand(store, ids, routeId, before, label);
  }

  /** Moves `ids` next to `nextTo` in `list` (the items of `container`). */
  function place(ids: string[], container: Container, list: StageChild[], nextTo: string, where: Where, label: string) {
    const rest = list.filter((c) => !ids.includes(c.id));
    const before = where === 'before' ? nextTo : (rest[rest.findIndex((c) => c.id === nextTo) + 1]?.id ?? null);
    return moveIntoCommand(store, ids, container, before, label);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ids = dragging;
    const to = target;
    dragging = null;
    target = null;
    if (!ids || !to) return;
    const label = t(dragKind === 'group' ? 'cmd.moveGroup' : 'cmd.moveSegment');
    const onto = store.get(to.id);
    let cmd = null;
    if (dragKind === 'stage' || dragKind === 'route') {
      const topLabel = t(dragKind === 'route' ? 'cmd.moveRoute' : 'cmd.moveStage');
      if (onto?.type === 'route') {
        cmd = to.where === 'into' ? moveTopCommand(store, ids, onto.id, null, topLabel) : placeTop(ids, undefined, tripChildren(store), onto.id, to.where, topLabel);
      } else if (onto?.type === 'stage') {
        cmd = placeTop(ids, inRoute(store, onto) ? onto.routeId : undefined, stageSiblings(store, onto), onto.id, to.where, topLabel);
      }
    } else if (onto?.type === 'stage') cmd = moveIntoCommand(store, ids, { stageId: onto.id }, null, label);
    else if (onto?.type === 'group') {
      cmd =
        to.where === 'into'
          ? moveIntoCommand(store, ids, { stageId: onto.stageId, groupId: onto.id }, null, label)
          : place(ids, { stageId: onto.stageId }, stageChildren(store, onto.stageId), onto.id, to.where, label);
    } else if (onto?.type === 'segment') {
      if (to.where === 'onto') {
        const moved = ids.map((id) => store.get(id, 'segment')).filter((s): s is Segment => !!s);
        fuseAction(ctx, [onto, ...moved], onto.id);
      } else {
        const container = inGroup(store, onto) ? { stageId: onto.stageId, groupId: onto.groupId } : { stageId: onto.stageId };
        cmd = place(ids, container, siblingsOf(store, onto), onto.id, to.where, label);
      }
    }
    if (cmd) commands.run(cmd);
  }

  const endDrag = () => {
    dragging = null;
    target = null;
  };

  const dropClass = (id: string) => (target?.id === id ? `drop-${target.where}` : '');

  /** A new stage, in the selected route if there is one. */
  function add() {
    const route = routeOf(store, selection.current[0]);
    const cmd = addStageCommand(store, ctx.tripId, t('tree.stageName', { n: stages.length + 1 }), t('cmd.addStage'), route?.id);
    commands.run(cmd);
    selection.set([cmd.changes[0]!.id]);
  }

  function addRoute() {
    const n = top.filter((c) => c.type === 'route').length + 1;
    const cmd = addRouteCommand(store, ctx.tripId, t('route.defaultName', { n }), t('cmd.addRoute'));
    commands.run(cmd);
    selection.set([cmd.changes[0]!.id]);
  }

  /** Shows only this route on the map (or everything again, if it's already the only one shown). */
  function solo(route: Route) {
    const others = top.filter((c) => c.id !== route.id).map((c) => c.id);
    const alone = !$hidden.has(route.id) && others.every((id) => $hidden.has(id));
    ctx.visibility.set(others, !alone);
    ctx.visibility.set([route.id], false);
  }

  function dissolve(route: Route) {
    const cmd = dissolveRouteCommand(store, route.id, t('cmd.dissolveRoute'));
    if (cmd) commands.run(cmd);
  }

  function ungroup(group: Group) {
    const cmd = ungroupCommand(store, group.id, t('cmd.ungroup'));
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
  <span class="muted">{t(top.some((c) => c.type === 'route') ? 'tree.routesAndStages' : 'tree.stages')}</span>
  <span class="head-actions">
    {#if $hidden.size}
      <button type="button" class="link" onclick={() => ctx.visibility.showAll()}>{t('tree.showAll')}</button>
    {/if}
    {#if top.length}
      {@const all = [...top.map((c) => c.id), ...stages.map((s) => s.id)]}
      {#if all.every((id) => collapsed.has(id))}
        <IconButton icon={icons.expand} label={t('tree.expandAll')} size={16} onclick={() => setCollapsed(all, false)} />
      {:else}
        <IconButton icon={icons.collapse} label={t('tree.collapseAll')} size={16} onclick={() => setCollapsed(all, true)} />
      {/if}
    {/if}
    <IconButton icon={icons.route} label={t('tree.addRoute')} size={16} onclick={addRoute} />
    <IconButton icon={icons.plus} label={t('tree.addStage')} size={16} onclick={add} />
  </span>
</div>

{#snippet eye(id: string, dimmedByParent = false)}
  {@const off = $hidden.has(id)}
  <button
    type="button"
    class="eye"
    class:off
    title={off ? t('tree.show') : t('tree.hide')}
    aria-label={off ? t('tree.show') : t('tree.hide')}
    aria-pressed={!off}
    disabled={dimmedByParent}
    onclick={(e) => {
      e.stopPropagation();
      ctx.visibility.toggle(id);
    }}
  >
    <Icon d={off ? icons.eyeOff : icons.eye} size={14} />
  </button>
{/snippet}

{#snippet editor(e: Entity)}
  {@const who = lastEditor(e)}
  {#if who}
    <span class="editor" style:background={who.color} title={who.title}></span>
  {/if}
{/snippet}

{#snippet segmentRow(seg: Segment, parentHidden: boolean)}
  <li
    class="row {dropClass(seg.id)}"
    data-id={seg.id}
    class:selected={$selected.includes(seg.id)}
    class:dragged={dragging?.includes(seg.id)}
    class:hidden={parentHidden || $hidden.has(seg.id)}
    draggable="true"
    title={t('tree.dragHint')}
    ondragstart={(e) => dragStart(e, seg)}
    ondragover={(e) => dragOver(e, seg.id, 'segment')}
    ondragleave={() => target?.id === seg.id && (target = null)}
    ondrop={drop}
    ondragend={endDrag}
  >
    <button type="button" class="name" onclick={(e) => click(e, seg.id, [seg])}>
      <Icon d={icons[seg.mode]} size={14} />
      <span class="label">{seg.name}</span>
      {@render editor(seg)}
      <span class="km muted">{km([seg])}</span>
    </button>
    {@render eye(seg.id, parentHidden)}
    <span class="actions">
      <IconButton
        icon={icons.trash}
        label={t('tree.delete')}
        size={14}
        onclick={() => commands.run({ label: t('cmd.deleteSegment'), changes: [edits.remove(store, seg.id)] })}
      />
    </span>
  </li>
{/snippet}

{#snippet stageRow(stage: Stage, parentHidden: boolean, routeColor: string | undefined)}
  {@const segs = segmentsByStage.get(stage.id) ?? []}
  {@const children = childrenByStage.get(stage.id) ?? []}
  {@const stageHidden = parentHidden || $hidden.has(stage.id)}
  <li>
    <div
      class="row {dropClass(stage.id)}"
      data-id={stage.id}
      class:selected={$selected.includes(stage.id)}
      class:hidden={stageHidden}
      class:dragged={dragging?.includes(stage.id)}
      role="treeitem"
      aria-selected={$selected.includes(stage.id)}
      aria-expanded={!collapsed.has(stage.id)}
      tabindex="-1"
      draggable="true"
      ondragstart={(e) => dragStageStart(e, stage.id)}
      ondragover={(e) => dragOver(e, stage.id, 'stage')}
      ondragleave={() => target?.id === stage.id && (target = null)}
      ondrop={drop}
      ondragend={endDrag}
    >
      <button
        type="button"
        class="chevron"
        class:closed={collapsed.has(stage.id)}
        disabled={!children.length}
        aria-label={collapsed.has(stage.id) ? t('tree.expand') : t('tree.collapse')}
        title={collapsed.has(stage.id) ? t('tree.expand') : t('tree.collapse')}
        onclick={() => setCollapsed([stage.id], !collapsed.has(stage.id))}
      >
        <Icon d={icons.down} size={12} />
      </button>
      <button type="button" class="name" onclick={(e) => click(e, stage.id, segs)}>
        <span class="swatch" style:background={routeColor ?? stage.color ?? 'var(--accent)'}></span>
        <span class="label">{stage.name}</span>
        {@render editor(stage)}
        <span class="km muted">{km(segs)}</span>
      </button>
      {@render eye(stage.id, parentHidden)}
      <span class="actions">
        <IconButton
          icon={icons.trash}
          label={t('tree.delete')}
          size={14}
          onclick={() => commands.run(deleteStage(store, stage.id, t('cmd.deleteStage')))}
        />
      </span>
    </div>
    {#if children.length && !collapsed.has(stage.id)}
      <ol class="segments">
        {#each children as child (child.id)}
          {#if child.type === 'group'}
            {@const gsegs = segmentsByGroup.get(child.id) ?? []}
            {@const groupHidden = $hidden.has(child.id)}
            <li>
              <div
                class="row group {dropClass(child.id)}"
                data-id={child.id}
                class:selected={$selected.includes(child.id)}
                class:hidden={stageHidden || groupHidden}
                class:dragged={dragging?.includes(child.id)}
                role="treeitem"
                aria-selected={$selected.includes(child.id)}
                aria-expanded={!collapsed.has(child.id)}
                tabindex="-1"
                draggable="true"
                title={t('tree.groupHint')}
                ondragstart={(e) => dragGroupStart(e, child.id)}
                ondragover={(e) => dragOver(e, child.id, 'group')}
                ondragleave={() => target?.id === child.id && (target = null)}
                ondrop={drop}
                ondragend={endDrag}
              >
                <button
                  type="button"
                  class="chevron"
                  class:closed={collapsed.has(child.id)}
                  disabled={!gsegs.length}
                  aria-label={collapsed.has(child.id) ? t('tree.expand') : t('tree.collapse')}
                  title={collapsed.has(child.id) ? t('tree.expand') : t('tree.collapse')}
                  onclick={() => setCollapsed([child.id], !collapsed.has(child.id))}
                >
                  <Icon d={icons.down} size={12} />
                </button>
                <button type="button" class="name" onclick={(e) => click(e, child.id, gsegs)}>
                  <span class="folder" style:color={child.color ?? routeColor ?? stage.color ?? 'var(--accent)'}><Icon d={icons.folder} size={14} /></span>
                  <span class="label">{child.name}</span>
                  {@render editor(child)}
                  <span class="km muted">{km(gsegs)}</span>
                </button>
                {@render eye(child.id, stageHidden)}
                <span class="actions">
                  <IconButton icon={icons.ungroup} label={t('tree.ungroup')} size={14} onclick={() => ungroup(child)} />
                  <IconButton
                    icon={icons.trash}
                    label={t('tree.delete')}
                    size={14}
                    onclick={() => commands.run(deleteGroupCommand(store, child.id, t('cmd.deleteGroup')))}
                  />
                </span>
              </div>
              {#if gsegs.length && !collapsed.has(child.id)}
                <ol class="segments">
                  {#each gsegs as seg (seg.id)}
                    {@render segmentRow(seg, stageHidden || groupHidden)}
                  {/each}
                </ol>
              {/if}
            </li>
          {:else}
            {@render segmentRow(child, stageHidden)}
          {/if}
        {/each}
      </ol>
    {/if}
  </li>
{/snippet}

{#if top.length === 0}
  <p class="muted">{t('tree.empty')}</p>
{:else}
  <ol bind:this={listEl}>
    {#each top as child (child.id)}
      {#if child.type === 'route'}
        {@const rstages = stagesByRoute.get(child.id) ?? []}
        {@const rsegs = routeSegs(child.id)}
        {@const routeHidden = $hidden.has(child.id)}
        <li>
          <div
            class="row route {dropClass(child.id)}"
            data-id={child.id}
            class:selected={$selected.includes(child.id)}
            class:hidden={routeHidden}
            class:dragged={dragging?.includes(child.id)}
            role="treeitem"
            aria-selected={$selected.includes(child.id)}
            aria-expanded={!collapsed.has(child.id)}
            tabindex="-1"
            draggable="true"
            title={t('tree.routeHint')}
            ondragstart={(e) => dragRouteStart(e, child.id)}
            ondragover={(e) => dragOver(e, child.id, 'route')}
            ondragleave={() => target?.id === child.id && (target = null)}
            ondrop={drop}
            ondragend={endDrag}
          >
            <button
              type="button"
              class="chevron"
              class:closed={collapsed.has(child.id)}
              disabled={!rstages.length}
              aria-label={collapsed.has(child.id) ? t('tree.expand') : t('tree.collapse')}
              title={collapsed.has(child.id) ? t('tree.expand') : t('tree.collapse')}
              onclick={() => setCollapsed([child.id], !collapsed.has(child.id))}
            >
              <Icon d={icons.down} size={12} />
            </button>
            <button type="button" class="name" onclick={(e) => click(e, child.id, rsegs)}>
              <span class="folder" style:color={child.color ?? 'var(--fg)'}><Icon d={icons.route} size={15} /></span>
              <span class="label">{child.name}</span>
              {@render editor(child)}
              <span class="km muted">{km(rsegs)}</span>
            </button>
            {@render eye(child.id)}
            <span class="actions">
              <IconButton icon={icons.focus} label={t('tree.solo')} size={14} onclick={() => solo(child)} />
              <IconButton icon={icons.ungroup} label={t('tree.dissolveRoute')} size={14} onclick={() => dissolve(child)} />
              <IconButton
                icon={icons.trash}
                label={t('tree.delete')}
                size={14}
                onclick={() => commands.run(deleteRouteCommand(store, child.id, t('cmd.deleteRoute')))}
              />
            </span>
          </div>
          {#if rstages.length && !collapsed.has(child.id)}
            <ol class="stages">
              {#each rstages as stage (stage.id)}
                {@render stageRow(stage, routeHidden, child.color)}
              {/each}
            </ol>
          {/if}
        </li>
      {:else}
        {@render stageRow(child, false, undefined)}
      {/if}
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
  .row.drop-into {
    background: var(--accent-soft);
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .link {
    margin-right: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
  }

  .chevron {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: transform 0.12s ease;
  }

  .chevron.closed {
    transform: rotate(-90deg);
  }

  .chevron:disabled {
    visibility: hidden;
  }

  .eye {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .eye:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--fg);
  }

  .eye.off {
    color: var(--accent);
  }

  .eye:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .row.hidden > .name {
    opacity: 0.45;
  }

  .row[draggable='true'] {
    cursor: grab;
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

  .stages {
    margin: 0 0 4px 12px;
    padding-left: 4px;
    border-left: 1px solid var(--border);
  }

  .row.route > .name {
    font-weight: 600;
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

  .folder {
    display: grid;
    flex: none;
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
