<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { blendFor, weekDay } from './codec';
  import { yearAt, type ClimateYear } from './data';
  import type { ClimateState } from './state';

  let { ctx, climate, lngLat }: { ctx: ModuleContext; climate: Writable<ClimateState>; lngLat: [number, number] } = $props();
  const t = $derived(ctx.t);

  let year = $state<ClimateYear | null | undefined>(undefined);
  let error = $state(false);
  $effect(() => {
    year = undefined;
    error = false;
    yearAt(lngLat[0], lngLat[1])
      .then((y) => (year = y))
      .catch(() => (error = true));
  });

  const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2027, m, 15).toLocaleDateString(undefined, { month: 'narrow' }));
  const monthName = (m: number) => new Date(2027, m, 15).toLocaleDateString(undefined, { month: 'long' });
  const W = 280;
  const H = 150;
  const PAD = { l: 28, r: 32, t: 8, b: 18 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const num = (list: (number | null)[]) => list.filter((v): v is number => v !== null);
  const chart = $derived.by(() => {
    if (!year) return null;
    const temps = [...num(year.tmax), ...num(year.tmin)];
    const tLo = temps.length ? Math.floor(Math.min(...temps) / 5) * 5 - 5 : 0;
    const tHi = temps.length ? Math.ceil(Math.max(...temps) / 5) * 5 + 5 : 30;
    const rHi = Math.max(100, ...num(year.ppt)) * 1.1;
    const x = (m: number) => PAD.l + ((m + 0.5) / 12) * plotW;
    const yT = (v: number) => PAD.t + plotH - ((v - tLo) / (tHi - tLo)) * plotH;
    const yR = (v: number) => PAD.t + plotH - (v / rHi) * plotH;
    const line = (list: (number | null)[]) =>
      list.map((v, m) => (v === null ? '' : `${m && list[m - 1] !== null ? 'L' : 'M'}${x(m).toFixed(1)} ${yT(v).toFixed(1)}`)).join(' ');
    return { tLo, tHi, rHi, x, yT, yR, high: line(year.tmax), low: line(year.tmin) };
  });

  /** The selected week, blended between months. */
  const now = $derived.by(() => {
    if (!year) return null;
    const { a, b, w } = blendFor(weekDay($climate.week));
    const mix = (list: (number | null)[]) => (list[a] == null || list[b] == null ? null : list[a]! + (list[b]! - list[a]!) * w);
    return { high: mix(year.tmax), low: mix(year.tmin), rain: mix(year.ppt), x: PAD.l + (weekDay($climate.week) / 365) * plotW };
  });
  const weekLabel = $derived(new Date(2027, 0, 1 + Math.round(weekDay($climate.week))).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }));
  const wettest = $derived.by(() => {
    if (!year) return null;
    let best = -1;
    year.ppt.forEach((v, m) => {
      if (v !== null && (best < 0 || v > year!.ppt[best]!)) best = m;
    });
    return best < 0 ? null : { month: monthName(best), mm: Math.round(year.ppt[best]!) };
  });
  const round = (v: number | null) => (v === null ? '–' : Math.round(v));
</script>

<h3>{t('climate.pointTitle')}</h3>
<p class="muted small">{lngLat[1].toFixed(3)}, {lngLat[0].toFixed(3)} · {t('climate.source')}</p>

{#if error}
  <p class="muted">{t('climate.loadFailed')}</p>
{:else if year === undefined}
  <p class="muted">{t('climate.loading')}</p>
{:else if year === null || !chart}
  <p class="muted">{t('climate.noData')}</p>
{:else}
  <svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label={t('climate.chartLabel')}>
    {#each year.ppt as v, m (m)}
      {#if v !== null}
        <rect x={chart.x(m) - 7} y={chart.yR(v)} width="14" height={PAD.t + plotH - chart.yR(v)} fill="#1d91c0" opacity="0.55" />
      {/if}
      <text x={chart.x(m)} y={H - 5} text-anchor="middle" class="axis">{MONTHS[m]}</text>
    {/each}
    {#each [chart.tLo, (chart.tLo + chart.tHi) / 2, chart.tHi] as v (v)}
      <text x={PAD.l - 4} y={chart.yT(v) + 3} text-anchor="end" class="axis">{Math.round(v)}°</text>
      <line x1={PAD.l} x2={W - PAD.r} y1={chart.yT(v)} y2={chart.yT(v)} class="grid" />
    {/each}
    {#each [0, chart.rHi / 1.1 / 2, chart.rHi / 1.1] as v (v)}
      <text x={W - PAD.r + 4} y={chart.yR(v) + 3} class="axis rain">{Math.round(v)}</text>
    {/each}
    <path d={chart.high} fill="none" stroke="#e4482c" stroke-width="2" />
    <path d={chart.low} fill="none" stroke="#3b4cc0" stroke-width="2" />
    {#if now}
      <line x1={now.x} x2={now.x} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--fg)" stroke-dasharray="3 2" stroke-width="1" />
    {/if}
  </svg>
  <p class="legend small">
    <span><i style:background="#e4482c"></i>{t('climate.highs')}</span>
    <span><i style:background="#3b4cc0"></i>{t('climate.lows')}</span>
    <span><i style:background="#1d91c0"></i>{t('climate.rainMm')}</span>
  </p>
  {#if now}
    <p class="small">
      {t('climate.aroundDate', { date: weekLabel })}
      <strong>{round(now.high)}°</strong> / {round(now.low)}° · {t('climate.rainShort', { mm: round(now.rain) })}
    </p>
  {/if}
  {#if wettest}
    <p class="muted small">{t('climate.wettest', { month: wettest.month, mm: wettest.mm })}</p>
  {/if}
{/if}

<style>
  h3 {
    margin: 0 28px 2px 0;
    font-size: 15px;
  }

  .small {
    margin: 4px 0;
    font-size: 12px;
  }

  svg {
    display: block;
    margin: 6px 0 2px;
  }

  .axis {
    fill: var(--fg-muted);
    font-size: 9px;
  }

  .axis.rain {
    fill: #1d91c0;
  }

  .grid {
    stroke: var(--border);
    stroke-width: 0.6;
  }

  .legend {
    display: flex;
    gap: 12px;
    color: var(--fg-muted);
  }

  .legend i {
    display: inline-block;
    width: 10px;
    height: 3px;
    margin-right: 4px;
    vertical-align: middle;
  }
</style>
