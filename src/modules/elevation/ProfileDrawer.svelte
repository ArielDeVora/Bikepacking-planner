<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { eraseCommand } from '../../lib/segment-edits';
  import { sliceLine } from '../../model/edit-ops';
  import { groupSegments, stageSegments as allStageSegments, tripSegments } from '../../lib/tree';
  import type { Segment } from '../../model/types';
  import { buildProfile, eleAt, GRADE_LEGEND, gradeAt, gradeColor, positionAt, type Profile } from './profile';

  type Scope = 'segment' | 'stage' | 'trip';

  let {
    ctx,
    open,
    setHover,
    setRange,
  }: {
    ctx: ModuleContext;
    open: Writable<boolean>;
    setHover: (pos: [number, number] | null) => void;
    setRange: (line: number[][] | null) => void;
  } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);
  const ids = $derived(ctx.selection.ids);

  const PAD = { left: 54, right: 10, top: 10, bottom: 20 };
  const HEIGHT = 140;

  let chosen = $state<Scope | null>(null);
  let width = $state(0);
  let canvas: HTMLCanvasElement | undefined = $state();
  let hoverX = $state<number | null>(null);
  /** Selected range along the segment, in metres (segment scope only). */
  let range = $state<{ from: number; to: number } | null>(null);
  let dragFrom: number | null = null;

  const selected = $derived.by(() => {
    void $store;
    return $ids.length === 1 ? store.get($ids[0]!) : undefined;
  });
  /** Selected segments (and those of selected groups), highlighted in the stage or trip profile. */
  const picked = $derived.by(() => {
    void $store;
    return $ids.flatMap((id) => {
      const e = store.get(id);
      return e?.type === 'segment' ? [e] : e?.type === 'group' ? groupSegments(store, id) : [];
    });
  });
  const pickedStage = $derived(picked.length && picked.every((s) => s.stageId === picked[0]!.stageId) ? picked[0]!.stageId : null);
  // With a segment selected, the profile shows its stage with the segment highlighted.
  const scopes = $derived<Scope[]>(
    picked.length === 1 ? ['stage', 'segment', 'trip'] : pickedStage ? ['stage', 'trip'] : picked.length ? ['trip'] : selected?.type === 'stage' ? ['stage', 'trip'] : ['trip'],
  );
  const scope = $derived(chosen && scopes.includes(chosen) ? chosen : scopes[0]!);

  // Back to the default view whenever the selection changes.
  let lastIds = '';
  $effect(() => {
    const key = $ids.join(',');
    if (key !== lastIds) {
      lastIds = key;
      chosen = null;
    }
  });

  const ground = (s: Segment) => s.mode !== 'plane';
  const stageSegments = (stageId: string) => allStageSegments(store, stageId).filter(ground);

  const target = $derived.by((): { title: string; segments: Segment[] } => {
    void $store;
    if (scope === 'segment' && picked.length === 1) return { title: picked[0]!.name, segments: [picked[0]!] };
    const stageId = selected?.type === 'stage' ? selected.id : pickedStage;
    if (scope === 'stage' && stageId) return { title: store.get(stageId, 'stage')?.name ?? '', segments: stageSegments(stageId) };
    return { title: store.get(ctx.tripId, 'trip')?.name ?? '', segments: tripSegments(store).filter(ground) };
  });

  const profile = $derived<Profile>(buildProfile(target.segments));
  const rangeSegment = $derived(scope === 'segment' && picked.length === 1 ? picked[0]! : null);
  const highlighted = $derived(
    scope === 'segment' ? [] : profile.ranges.filter((r) => picked.some((s) => s.id === r.id)),
  );
  const highlightStats = $derived.by(() => {
    if (!highlighted.length) return null;
    const segs = picked.filter((s) => highlighted.some((r) => r.id === s.id));
    return { km: segs.reduce((n, s) => n + s.stats.lengthM, 0), up: segs.reduce((n, s) => n + s.stats.ascentM, 0) };
  });

  // A range belongs to one segment; drop it when the segment changes.
  let rangeOwner: string | null = null;
  $effect(() => {
    const id = rangeSegment?.id ?? null;
    if (id !== rangeOwner) {
      rangeOwner = id;
      range = null;
    }
  });
  $effect(() => {
    if (range && rangeSegment && $open) setRange(sliceLine(rangeSegment, range.from, range.to).map((c) => [c[0], c[1]]));
    else setRange(null);
  });
  const hasElevation = $derived(Number.isFinite(profile.maxEle));

  const km = (m: number) => (m >= 100_000 ? (m / 1000).toFixed(0) : (m / 1000).toFixed(1));

  function niceStep(range: number, target: number): number {
    const raw = range / target;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  }

  const yRange = $derived.by(() => {
    if (!hasElevation) return { lo: 0, hi: 100 };
    const span = Math.max(50, profile.maxEle - profile.minEle);
    const step = niceStep(span, 3);
    return { lo: Math.floor(profile.minEle / step) * step, hi: Math.ceil(profile.maxEle / step) * step || step };
  });

  const plotW = $derived(Math.max(1, width - PAD.left - PAD.right));
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xToDist = (x: number) => ((x - PAD.left) / plotW) * profile.lengthM;
  const yOf = (e: number) => PAD.top + plotH - ((e - yRange.lo) / (yRange.hi - yRange.lo)) * plotH;

  $effect(() => {
    if (!canvas || !width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    const g = canvas.getContext('2d')!;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, HEIGHT);
    if (!hasElevation || profile.lengthM <= 0) return;

    const style = getComputedStyle(canvas);
    const fg = style.getPropertyValue('--fg').trim() || '#222';
    const muted = style.getPropertyValue('--fg-muted').trim() || '#888';
    const border = style.getPropertyValue('--border').trim() || '#ddd';
    const accent = style.getPropertyValue('--accent').trim() || '#d9480f';
    const accentSoft = style.getPropertyValue('--accent-soft').trim() || 'rgba(217,72,15,0.12)';
    g.font = '11px system-ui, sans-serif';

    // Grid and labels
    g.strokeStyle = border;
    g.fillStyle = muted;
    g.lineWidth = 1;
    const yStep = niceStep(yRange.hi - yRange.lo, 3);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let e = yRange.lo; e <= yRange.hi + 0.1; e += yStep) {
      const y = Math.round(yOf(e)) + 0.5;
      g.beginPath();
      g.moveTo(PAD.left, y);
      g.lineTo(PAD.left + plotW, y);
      g.stroke();
      g.fillText(`${Math.round(e)} m`, PAD.left - 6, y);
    }
    const xStep = niceStep(profile.lengthM / 1000, Math.max(2, Math.floor(plotW / 90))) * 1000;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let d = 0; d <= profile.lengthM; d += xStep) {
      const x = PAD.left + (d / profile.lengthM) * plotW;
      g.fillText(`${km(d)} km`, x, PAD.top + plotH + 5);
    }

    const xOf = (d: number) => PAD.left + (d / profile.lengthM) * plotW;

    // Background band behind the selected segments
    for (const r of highlighted) {
      g.fillStyle = accentSoft;
      g.fillRect(xOf(r.from), PAD.top, Math.max(1, xOf(r.to) - xOf(r.from)), plotH);
    }

    // Area coloured by gradient, then the outline
    const base = PAD.top + plotH;
    let prev: number | null = null;
    g.lineWidth = 1.5;
    const outline = new Path2D();
    for (let x = 0; x < plotW; x++) {
      const d0 = (x / plotW) * profile.lengthM;
      const d1 = ((x + 1) / plotW) * profile.lengthM;
      const e = eleAt(profile, (d0 + d1) / 2);
      if (Number.isNaN(e)) {
        prev = null;
        continue;
      }
      const y = yOf(e);
      g.fillStyle = gradeColor(gradeAt(profile, d0, d1));
      g.fillRect(PAD.left + x, y, 1.01, base - y);
      if (prev === null) outline.moveTo(PAD.left + x, y);
      else outline.lineTo(PAD.left + x, y);
      prev = y;
    }
    g.strokeStyle = fg;
    g.stroke(outline);

    // The selected segments' outline, thicker and in the accent colour
    if (highlighted.length) {
      const strong = new Path2D();
      for (const r of highlighted) {
        let started = false;
        for (let x = Math.floor(xOf(r.from) - PAD.left); x <= Math.ceil(xOf(r.to) - PAD.left) && x < plotW; x++) {
          const e = eleAt(profile, ((x + 0.5) / plotW) * profile.lengthM);
          if (Number.isNaN(e)) {
            started = false;
            continue;
          }
          if (!started) strong.moveTo(PAD.left + x, yOf(e));
          else strong.lineTo(PAD.left + x, yOf(e));
          started = true;
        }
      }
      g.lineWidth = 3;
      g.strokeStyle = accent;
      g.stroke(strong);
      g.lineWidth = 1.5;
    }

    if (range) {
      const x0 = PAD.left + (Math.min(range.from, range.to) / profile.lengthM) * plotW;
      const x1 = PAD.left + (Math.max(range.from, range.to) / profile.lengthM) * plotW;
      g.fillStyle = 'rgba(224, 49, 49, 0.25)';
      g.fillRect(x0, PAD.top, x1 - x0, plotH);
    }

    if (hoverX !== null) {
      g.strokeStyle = fg;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(hoverX + 0.5, PAD.top);
      g.lineTo(hoverX + 0.5, base);
      g.stroke();
    }
  });

  const hoverInfo = $derived.by(() => {
    if (hoverX === null || !hasElevation) return null;
    const d = xToDist(hoverX);
    const e = eleAt(profile, d);
    const span = profile.lengthM / plotW;
    return { d, e, grade: gradeAt(profile, d - span, d + span) };
  });

  const clampX = (x: number) => Math.max(PAD.left, Math.min(PAD.left + plotW, x));

  function onMove(e: PointerEvent) {
    const rect = canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (dragFrom !== null) {
      range = { from: dragFrom, to: xToDist(clampX(x)) };
    }
    if (x < PAD.left || x > PAD.left + plotW || !hasElevation) return onLeave();
    hoverX = x;
    setHover(positionAt(profile, xToDist(x)));
  }

  function onDown(e: PointerEvent) {
    if (!rangeSegment || !hasElevation || e.button !== 0) return;
    const x = e.clientX - canvas!.getBoundingClientRect().left;
    if (x < PAD.left || x > PAD.left + plotW) return;
    canvas!.setPointerCapture(e.pointerId);
    dragFrom = xToDist(x);
    range = null;
  }

  function onUp() {
    if (dragFrom === null) return;
    dragFrom = null;
    // A click rather than a drag clears the selection.
    if (range && (Math.abs(range.to - range.from) / profile.lengthM) * plotW < 4) range = null;
  }

  function eraseRange() {
    if (!range || !rangeSegment) return;
    ctx.commands.run(
      eraseCommand(ctx.store, rangeSegment, range.from, range.to, {
        label: t('cmd.erase'),
        name: (name) => name,
      }),
    );
    range = null;
  }

  function onLeave() {
    hoverX = null;
    setHover(null);
  }
</script>

{#if $open}
  <section class="drawer" aria-label={t('elevation.title')}>
    <header>
      <strong class="title">{target.title || t('elevation.title')}</strong>
      <div class="scopes" role="group">
        {#each scopes as s (s)}
          <button type="button" class:active={s === scope} onclick={() => (chosen = s)}>{t(`elevation.scope.${s}`)}</button>
        {/each}
      </div>
      {#if hasElevation}
        <span class="stats">
          <span>{km(profile.lengthM)} km</span>
          <span title={t('segment.ascent')}>↗ {profile.ascentM} m</span>
          <span title={t('segment.descent')}>↘ {profile.descentM} m</span>
          <span title={t('elevation.max')}>⤒ {Math.round(profile.maxEle)} m</span>
        </span>
        {#if highlightStats}
          <span class="picked" title={t('elevation.selection')}>■ {km(highlightStats.km)} km · ↗ {highlightStats.up} m</span>
        {/if}
      {/if}
      <span class="spacer"></span>
      {#if range}
        <span class="selection">
          {km(Math.abs(range.to - range.from))} km
          <button type="button" class="erase" onclick={eraseRange}>{t('elevation.eraseRange')}</button>
          <button type="button" class="link" onclick={() => (range = null)}>{t('io.cancel')}</button>
        </span>
      {:else if rangeSegment && hasElevation}
        <span class="muted">{t('elevation.dragHint')}</span>
      {/if}
      <span class="legend" aria-hidden="true">
        {#each GRADE_LEGEND as g (g.label)}
          <span><i style:background={g.color}></i>{g.label}</span>
        {/each}
      </span>
      <IconButton icon={icons.close} label={t('card.close')} size={14} onclick={() => open.set(false)} />
    </header>
    <div class="plot" bind:clientWidth={width}>
      {#if !hasElevation}
        <p class="empty muted">{target.segments.length ? t('elevation.noData') : t('elevation.empty')}</p>
      {/if}
      <canvas
        bind:this={canvas}
        style:height="{HEIGHT}px"
        onpointermove={onMove}
        onpointerleave={onLeave}
        onpointerdown={onDown}
        onpointerup={onUp}
      ></canvas>
      {#if hoverInfo && hoverX !== null}
        <div class="tip" style:left="{hoverX}px">
          {km(hoverInfo.d)} km · {Number.isNaN(hoverInfo.e) ? '–' : `${Math.round(hoverInfo.e)} m`} · {hoverInfo.grade.toFixed(1)}%
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .drawer {
    padding: 8px 10px 6px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 12px;
  }

  .title {
    font-size: 13px;
    max-width: 30ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scopes {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .scopes button {
    padding: 2px 8px;
    border: 0;
    background: var(--bg);
    cursor: pointer;
    font-size: 12px;
  }

  .scopes button + button {
    border-left: 1px solid var(--border);
  }

  .scopes button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .stats {
    display: flex;
    gap: 10px;
    font-variant-numeric: tabular-nums;
  }

  .picked {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  .spacer {
    flex: 1;
  }

  .selection {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .erase {
    padding: 2px 8px;
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    cursor: pointer;
    font-size: 12px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 12px;
  }

  .legend {
    display: flex;
    gap: 8px;
    color: var(--fg-muted);
  }

  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 3px;
    border-radius: 2px;
    vertical-align: -1px;
  }

  .plot {
    position: relative;
  }

  canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    font-size: 13px;
  }

  .tip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--fg);
    color: var(--bg);
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
  }

  @media (max-width: 900px) {
    .legend {
      display: none;
    }
  }
</style>
