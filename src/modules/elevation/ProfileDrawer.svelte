<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import { compareOrder } from '../../model/order';
  import type { Segment } from '../../model/types';
  import { buildProfile, eleAt, GRADE_LEGEND, gradeAt, gradeColor, positionAt, type Profile } from './profile';

  type Scope = 'segment' | 'stage' | 'trip';

  let {
    ctx,
    open,
    setHover,
  }: { ctx: ModuleContext; open: Writable<boolean>; setHover: (pos: [number, number] | null) => void } = $props();
  const { t } = $derived(ctx);
  const store = $derived(ctx.store);
  const ids = $derived(ctx.selection.ids);

  const PAD = { left: 54, right: 10, top: 10, bottom: 20 };
  const HEIGHT = 140;

  let chosen = $state<Scope | null>(null);
  let width = $state(0);
  let canvas: HTMLCanvasElement | undefined = $state();
  let hoverX = $state<number | null>(null);

  const selected = $derived.by(() => {
    void $store;
    return $ids.length === 1 ? store.get($ids[0]!) : undefined;
  });
  const scopes = $derived<Scope[]>(
    selected?.type === 'segment' ? ['segment', 'stage', 'trip'] : selected?.type === 'stage' ? ['stage', 'trip'] : ['trip'],
  );
  const scope = $derived(chosen && scopes.includes(chosen) ? chosen : scopes[0]!);

  const ground = (s: Segment) => s.mode !== 'plane';
  const stageSegments = (stageId: string) => store.list('segment', (s) => s.stageId === stageId && ground(s)).sort(compareOrder);

  const target = $derived.by((): { title: string; segments: Segment[] } => {
    void $store;
    if (scope === 'segment' && selected?.type === 'segment') return { title: selected.name, segments: [selected] };
    const stageId = selected?.type === 'stage' ? selected.id : selected?.type === 'segment' ? selected.stageId : null;
    if (scope === 'stage' && stageId) return { title: store.get(stageId, 'stage')?.name ?? '', segments: stageSegments(stageId) };
    const stages = store.list('stage').sort(compareOrder);
    return { title: store.get(ctx.tripId, 'trip')?.name ?? '', segments: stages.flatMap((st) => stageSegments(st.id)) };
  });

  const profile = $derived<Profile>(buildProfile(target.segments));
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

  function onMove(e: PointerEvent) {
    const rect = canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PAD.left || x > PAD.left + plotW || !hasElevation) return onLeave();
    hoverX = x;
    setHover(positionAt(profile, xToDist(x)));
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
      {/if}
      <span class="spacer"></span>
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
      <canvas bind:this={canvas} style:height="{HEIGHT}px" onpointermove={onMove} onpointerleave={onLeave}></canvas>
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

  .spacer {
    flex: 1;
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
