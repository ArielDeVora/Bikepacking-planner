<script lang="ts" module>
  import type { Rating } from './seasons';

  /** A row of the calendar, worked out by the planning view. */
  export interface CalRow {
    key: string;
    kind: 'stage' | 'row' | 'strip';
    label: string;
    sub?: string;
    flag?: string;
    color?: string;
    segmentId?: string;
    /** Season rating per column (null: unknown). */
    heat?: (Rating | null)[];
    /** When we're there: runs of columns, moving or resting. */
    bars?: { from: number; to: number; kind: 'move' | 'transport' | 'rest' }[];
    pins?: { col: number; late: boolean; title: string }[];
    /** Days spent moving on this line (for resizing its bar). */
    rideDays?: number;
  }

  export interface CalRest {
    id: string;
    from: number;
    to: number;
    name: string;
  }
</script>

<script lang="ts">
  import { isPhone } from '../../lib/ui/phone';

  let {
    first,
    count,
    rows,
    rests,
    width,
    selected = null,
    describe,
    onAddRest,
    onRowClick,
    onRestClick,
    onBarDrag,
  }: {
    /** Day number (days since 1970-01-01) of the first column, and how many columns. */
    first: number;
    count: number;
    rows: CalRow[];
    rests: CalRest[];
    /** Width of a day, in pixels. */
    width: number;
    /** The selected segment, highlighted. */
    selected?: string | null;
    describe: (col: number, row: CalRow | null) => string[];
    onAddRest: (fromCol: number, toCol: number) => void;
    onRowClick: (row: CalRow) => void;
    onRestClick: (id: string) => void;
    /** A line's bars dragged by `delta` days: moved, or its end pulled. */
    onBarDrag?: (row: CalRow, mode: 'move' | 'resize', delta: number) => void;
  } = $props();

  // The names column: drag its right edge to resize it (remembered in this browser).
  const MIN_LABEL = 140;
  const MAX_LABEL = 600;
  let LABEL_W = $state(readLabelWidth());
  function readLabelWidth(): number {
    try {
      return Math.min(MAX_LABEL, Math.max(MIN_LABEL, Number(localStorage.getItem('bp:plan:labelWidth')) || (isPhone() ? MIN_LABEL : 250)));
    } catch {
      return isPhone() ? MIN_LABEL : 250;
    }
  }
  function resizeLabels(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = LABEL_W;
    const move = (ev: PointerEvent) => (LABEL_W = Math.round(Math.min(MAX_LABEL, Math.max(MIN_LABEL, startW + ev.clientX - startX))));
    const up = () => {
      el.removeEventListener('pointermove', move);
      try {
        localStorage.setItem('bp:plan:labelWidth', String(LABEL_W));
      } catch {
        /* not remembered */
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
  }

  // Dragging a line's bars: from the middle to move them, from the right end of the last to resize.
  let dragging = $state<{ key: string; mode: 'move' | 'resize'; delta: number } | null>(null);
  function barDown(e: PointerEvent, row: CalRow, isLast: boolean) {
    if (!onBarDrag || e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const mode: 'move' | 'resize' = isLast && r.right - e.clientX <= 8 ? 'resize' : 'move';
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    dragging = { key: row.key, mode, delta: 0 };
    tip = null;
    const move = (ev: PointerEvent) => {
      if (dragging) dragging = { ...dragging, delta: Math.round((ev.clientX - startX) / width) };
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      const d = dragging;
      dragging = null;
      if (d && d.delta) onBarDrag(row, d.mode, d.delta);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
  }
  const barShift = (row: CalRow) => (dragging?.key === row.key && dragging.mode === 'move' ? dragging.delta * width : 0);
  const barGrow = (row: CalRow, isLast: boolean) => (isLast && dragging?.key === row.key && dragging.mode === 'resize' ? dragging.delta * width : 0);
  const DAY_MS = 86_400_000;
  const HEAT = ['#e06666', '#f6b26b', '#93c47d'];

  const dateOf = (col: number) => new Date((first + col) * DAY_MS);

  // Months along the top.
  const months = $derived.by(() => {
    const out: { label: string; from: number; to: number }[] = [];
    for (let col = 0; col < count; col++) {
      const d = dateOf(col);
      const label = d.toLocaleDateString(undefined, { month: 'short', year: d.getUTCMonth() === 0 || col === 0 ? 'numeric' : undefined, timeZone: 'UTC' });
      const last = out.at(-1);
      if (last && d.getUTCDate() !== 1) last.to = col;
      else out.push({ label, from: col, to: col });
    }
    return out;
  });

  /** Background of a track: the season colours, as one gradient with a stop where the rating changes. */
  function heatGradient(heat: (Rating | null)[] | undefined): string {
    if (!heat?.length) return 'none';
    const stops: string[] = [];
    let start = 0;
    for (let col = 1; col <= heat.length; col++) {
      if (col < heat.length && heat[col] === heat[start]) continue;
      const v = heat[start];
      const c = v === null || v === undefined ? 'transparent' : HEAT[v]!;
      stops.push(`${c} ${start * width}px ${col * width}px`);
      start = col;
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }

  // Lines between days (when wide enough) and a stronger one at each month.
  const grid = $derived(
    width >= 8
      ? `repeating-linear-gradient(to right, transparent 0 ${width - 1}px, rgb(0 0 0 / 0.08) ${width - 1}px ${width}px)`
      : 'none',
  );

  // Tooltip
  let tip = $state<{ x: number; y: number; lines: string[] } | null>(null);
  // On a touch screen there's no hovering: a tap shows the day's details for a few seconds.
  let tipTimer = 0;
  function tap(e: PointerEvent, row: CalRow | null) {
    if (e.pointerType !== 'touch') return;
    hover(e, row);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => (tip = null), 4000);
  }

  function hover(e: PointerEvent, row: CalRow | null) {
    if (e.pointerType === 'touch' && e.type === 'pointermove') return;
    const track = e.currentTarget as HTMLElement;
    const r = track.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / width);
    if (col < 0 || col >= count) return (tip = null);
    tip = { x: e.clientX, y: e.clientY, lines: describe(col, row) };
  }

  // Dragging across the dates adds a rest period.
  let picking = $state<{ from: number; to: number } | null>(null);
  function colAt(e: PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(count - 1, Math.floor((e.clientX - r.left) / width)));
  }
  function pickStart(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const col = colAt(e, el);
    picking = { from: col, to: col };
  }
  function pickMove(e: PointerEvent) {
    if (picking) picking = { ...picking, to: colAt(e, e.currentTarget as HTMLElement) };
  }
  function pickEnd() {
    if (!picking) return;
    const { from, to } = picking;
    picking = null;
    onAddRest(Math.min(from, to), Math.max(from, to));
  }

  const dayLabel = (col: number) => {
    const d = dateOf(col);
    return width >= 18 ? String(d.getUTCDate()) : d.getUTCDay() === 1 ? String(d.getUTCDate()) : '';
  };
</script>

<div class="scroller" style:--w="{width}px" style:--label="{LABEL_W}px">
  <div class="grid" style:width="{LABEL_W + count * width}px">
    <div class="head">
      <div class="corner">
        <span class="label-resize" role="separator" aria-orientation="vertical" onpointerdown={resizeLabels}></span>
      </div>
      <div class="months">
        {#each months as m (m.from)}
          <div class="month" style:left="{m.from * width}px" style:width="{(m.to - m.from + 1) * width}px"><span>{m.label}</span></div>
        {/each}
      </div>
      <div
        class="days"
        role="slider"
        tabindex="-1"
        aria-valuenow={picking?.to ?? 0}
        onpointerdown={pickStart}
        onpointermove={pickMove}
        onpointerup={pickEnd}
        onpointercancel={() => (picking = null)}
      >
        {#each { length: count } as _, col (col)}
          {@const label = dayLabel(col)}
          {#if label}<span class="d" style:left="{col * width}px" style:width="{width}px">{label}</span>{/if}
        {/each}
        {#if picking}
          <div class="pick" style:left="{Math.min(picking.from, picking.to) * width}px" style:width="{(Math.abs(picking.to - picking.from) + 1) * width}px"></div>
        {/if}
      </div>
    </div>

    <div class="body">
      {#each rows as row (row.key)}
        <div class="row {row.kind}" class:selected={!!row.segmentId && row.key === selected}>
          <button type="button" class="label" disabled={!row.segmentId} onclick={(e) => !(e.target as HTMLElement).closest('.label-resize') && onRowClick(row)} title={row.label}>
            {#if row.color}<span class="swatch" style:background={row.color}></span>{/if}
            {#if row.flag}<span class="flag">{row.flag}</span>{/if}
            <span class="name">{row.label}</span>
            {#if row.sub}<span class="sub">{row.sub}</span>{/if}
            <span class="label-resize" role="separator" aria-orientation="vertical" onpointerdown={resizeLabels}></span>
          </button>
          <div
            class="track"
            role="presentation"
            style:background-image="{grid}, {heatGradient(row.heat)}"
            onpointermove={(e) => hover(e, row)}
            onpointerdown={(e) => tap(e, row)}
            onpointerleave={() => (tip = null)}
          >
            {#each row.bars ?? [] as bar, i (bar.from)}
              {@const isLast = i === (row.bars?.length ?? 0) - 1}
              <div
                class="bar {bar.kind}"
                class:draggable={!!onBarDrag && row.kind === 'row'}
                class:dragging={dragging?.key === row.key}
                role="presentation"
                style:left="{bar.from * width + barShift(row)}px"
                style:width="{Math.max(width / 2, (bar.to - bar.from + 1) * width + barGrow(row, isLast))}px"
                onpointerdown={row.kind === 'row' ? (e) => barDown(e, row, isLast) : undefined}
              ></div>
            {/each}
            {#if dragging?.key === row.key && dragging.delta}
              <span class="drag-note" style:left="{(row.bars?.at(-1)?.to ?? 0) * width + width + 6 + barShift(row) + barGrow(row, true)}px">
                {dragging.delta > 0 ? '+' : ''}{dragging.delta} d
              </span>
            {/if}
            {#each row.pins ?? [] as pin (pin.col)}
              <span class="pin" class:late={pin.late} style:left="{pin.col * width}px" title={pin.title}>▼</span>
            {/each}
          </div>
        </div>
      {/each}

      {#each rests as rest (rest.id)}
        <button
          type="button"
          class="rest"
          style:left="{LABEL_W + rest.from * width}px"
          style:width="{(rest.to - rest.from + 1) * width}px"
          title={rest.name}
          onclick={() => onRestClick(rest.id)}
        ><span>{rest.name}</span></button>
      {/each}
    </div>
  </div>
</div>

{#if tip}
  <div class="tip" style:left="{Math.max(12, Math.min(tip.x + 14, window.innerWidth - 332))}px" style:top="{tip.y + 14}px">
    {#each tip.lines as line, i (i)}<div class:first={i === 0}>{line}</div>{/each}
  </div>
{/if}

<style>
  .scroller {
    position: relative;
    height: 100%;
    overflow: auto;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .grid {
    position: relative;
  }

  .head {
    position: sticky;
    top: 0;
    z-index: 3;
    height: 44px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .label-resize {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    width: 7px;
    z-index: 5;
    cursor: ew-resize;
  }

  .label-resize:hover {
    background: linear-gradient(to right, transparent 3px, var(--accent) 3px, var(--accent) 4px, transparent 4px);
  }

  .corner {
    position: sticky;
    left: 0;
    z-index: 4;
    width: var(--label);
    height: 44px;
    background: var(--bg);
  }

  .months,
  .days {
    position: absolute;
    left: var(--label);
    right: 0;
  }

  .months {
    top: 0;
    height: 22px;
  }

  .month span {
    display: inline-block;
    position: sticky;
    left: calc(var(--label) + 6px);
  }

  .month {
    position: absolute;
    top: 0;
    height: 22px;
    padding: 3px 6px;
    border-left: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
  }

  .days {
    top: 22px;
    height: 22px;
    cursor: crosshair;
    user-select: none;
  }

  .d {
    position: absolute;
    top: 3px;
    font-size: 10px;
    text-align: center;
    color: var(--fg-muted);
  }

  .pick {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgb(76 110 245 / 0.3);
    border: 1px solid #4c6ef5;
  }

  .body {
    position: relative;
  }

  .row {
    display: flex;
    height: 24px;
    border-bottom: 1px solid var(--border);
  }

  .row.stage {
    height: 26px;
    background: var(--bg-sunken);
  }

  .row.strip {
    height: 28px;
    border-bottom: 2px solid var(--border);
  }

  .label {
    position: sticky;
    left: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    width: var(--label);
    padding: 0 8px;
    border: 0;
    border-right: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .label:disabled {
    cursor: default;
  }

  .row.selected .label {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .row.selected .track {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .row.stage .label {
    background: var(--bg-sunken);
    font-weight: 700;
  }

  .row.strip .label {
    font-weight: 600;
  }

  .label:not(:disabled):hover .name {
    text-decoration: underline;
  }

  .swatch {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .flag {
    flex: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    flex: none;
    color: var(--fg-muted);
    font-size: 11px;
  }

  .track {
    position: relative;
    flex: 1;
    background-repeat: no-repeat;
    opacity: 0.95;
  }

  .row.stage .track {
    background-image: none !important;
  }

  .bar {
    position: absolute;
    top: 6px;
    bottom: 6px;
    border-radius: 3px;
    background: #212529;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.6);
  }

  .bar.draggable {
    cursor: grab;
    /* A finger on a bar drags it rather than scrolling the calendar. */
    touch-action: none;
  }

  .bar.draggable::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  .bar.dragging {
    opacity: 0.75;
    box-shadow: 0 0 0 2px var(--accent);
    cursor: grabbing;
  }

  .drag-note {
    position: absolute;
    top: 3px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
  }

  .bar.transport {
    background: repeating-linear-gradient(90deg, #212529 0 6px, #868e96 6px 9px);
  }

  .bar.rest {
    background: repeating-linear-gradient(45deg, #212529 0 3px, rgb(255 255 255 / 0.85) 3px 6px);
  }

  .pin {
    position: absolute;
    top: -2px;
    font-size: 10px;
    color: #1c7ed6;
    transform: translateX(-1px);
  }

  .pin.late {
    color: var(--danger);
  }

  .rest {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    padding: 0;
    border: 0;
    border-left: 1px solid #4c6ef5;
    border-right: 1px solid #4c6ef5;
    background: repeating-linear-gradient(-45deg, rgb(76 110 245 / 0.18) 0 4px, rgb(76 110 245 / 0.06) 4px 8px);
    cursor: pointer;
    overflow: hidden;
  }

  .rest span {
    position: sticky;
    top: 48px;
    display: block;
    padding: 2px 3px;
    color: #364fc7;
    font-size: 10px;
    font-weight: 700;
    writing-mode: vertical-rl;
  }

  .tip {
    position: fixed;
    max-width: min(320px, calc(100vw - 24px));
    z-index: 40;
    max-width: 320px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 12px;
    line-height: 1.45;
    pointer-events: none;
  }

  .tip .first {
    font-weight: 700;
  }
</style>
