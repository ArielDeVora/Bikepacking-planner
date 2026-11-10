<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { PRECIPITATION, TEMPERATURE, weekDay, WEEKS, type Scale } from './codec';
  import type { ClimateState } from './state';

  let { ctx, climate }: { ctx: ModuleContext; climate: Writable<ClimateState> } = $props();
  const t = $derived(ctx.t);

  const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2027, m, 15).toLocaleDateString(undefined, { month: 'narrow' }));
  const scale = $derived($climate.shown === 'rain' ? PRECIPITATION : TEMPERATURE);
  const label = $derived(new Date(2027, 0, 1 + Math.round(weekDay($climate.week))).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }));

  /** Position (0–1) of a value on the legend: square-root axis for rain. */
  function pos(s: Scale, v: number): number {
    const f = s === PRECIPITATION ? Math.sqrt : (x: number) => x;
    const lo = f(s.stops[0]![0]);
    const hi = f(s.stops.at(-1)![0]);
    return (f(Math.max(s.stops[0]![0], v)) - lo) / (hi - lo);
  }
  const gradient = $derived(
    `linear-gradient(to right, ${scale.stops.map(([v, c]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0.35, c[3] / 255)}) ${(pos(scale, v) * 100).toFixed(1)}%`).join(', ')})`,
  );

  const set = (patch: Partial<ClimateState>) => climate.update((s) => ({ ...s, ...patch }));
</script>

{#if $climate.shown}
  <div class="bar" role="group" aria-label={t('climate.title')}>
    <div class="top">
      <button
        type="button"
        class="play"
        aria-label={$climate.playing ? t('climate.pause') : t('climate.play')}
        title={$climate.playing ? t('climate.pause') : t('climate.play')}
        onclick={() => set({ playing: !$climate.playing })}
      >
        {#if $climate.playing}<span class="pause-icon">❚❚</span>{:else}<Icon d={icons.play} size={14} />{/if}
      </button>
      <strong>{$climate.shown === 'rain' ? t('climate.rainTitle') : t('climate.tempTitle')}</strong>
      {#if $climate.shown === 'temp'}
        <span class="seg">
          <button type="button" class:on={$climate.temp === 'tmax'} onclick={() => set({ temp: 'tmax' })}>{t('climate.highs')}</button>
          <button type="button" class:on={$climate.temp === 'tmin'} onclick={() => set({ temp: 'tmin' })}>{t('climate.lows')}</button>
        </span>
      {/if}
      <span class="when">{t('climate.around', { date: label })}</span>
    </div>
    <input
      type="range"
      min="0"
      max={WEEKS - 1}
      value={$climate.week}
      aria-label={t('climate.week')}
      oninput={(e) => set({ week: Number(e.currentTarget.value), playing: false })}
    />
    <div class="months" aria-hidden="true">
      {#each MONTHS as m, i (i)}<span>{m}</span>{/each}
    </div>
    <div class="legend">
      <div class="ramp" style:background={gradient}></div>
      <div class="ticks">
        {#each scale.ticks as v (v)}
          <span style:left="{pos(scale, v) * 100}%">{v}</span>
        {/each}
        <span class="unit">{$climate.shown === 'rain' ? t('climate.mmMonth') : scale.unit}</span>
      </div>
    </div>
    <p class="note">{t('climate.note')}</p>
  </div>
{/if}

<style>
  .bar {
    flex: none;
    width: min(420px, calc(100vw - 32px));
    padding: 8px 12px 6px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 12px;
    pointer-events: auto;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .play {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }

  .pause-icon {
    font-size: 9px;
    letter-spacing: -1px;
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg button {
    padding: 2px 8px;
    border: 0;
    background: var(--bg);
    color: var(--fg-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .seg button.on {
    background: var(--accent-soft);
    color: var(--fg);
  }

  .when {
    margin-left: auto;
    color: var(--fg-muted);
  }

  input[type='range'] {
    width: 100%;
    margin: 6px 0 0;
    accent-color: var(--accent);
  }

  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    color: var(--fg-muted);
    font-size: 10px;
    text-align: center;
  }

  .legend {
    margin-top: 6px;
  }

  .ramp {
    height: 8px;
    border-radius: 4px;
  }

  .ticks {
    position: relative;
    height: 14px;
    color: var(--fg-muted);
    font-size: 10px;
  }

  .ticks span {
    position: absolute;
    top: 1px;
    transform: translateX(-50%);
  }

  .ticks .unit {
    right: 0;
    transform: none;
    left: auto !important;
  }

  .note {
    margin: 2px 0 0;
    color: var(--fg-muted);
    font-size: 10.5px;
  }
</style>
