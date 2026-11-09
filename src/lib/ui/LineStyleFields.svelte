<script lang="ts">
  import { LINE_DASH_ORDER, LINE_DASHES, LINE_WIDTH_RANGE } from '../../config/modes';
  import type { t as translate } from '../../core/i18n';
  import type { LineDash } from '../../model/types';
  import { icons } from '../icons';
  import IconButton from './IconButton.svelte';
  import type { LineStyleValue } from './line-style';

  let {
    t,
    value,
    shownColor,
    shownWidth,
    onChange,
    onDone,
  }: {
    t: typeof translate;
    value: LineStyleValue;
    /** What the line looks like now (for the colour picker and slider). */
    shownColor: string;
    shownWidth: number;
    onChange: (patch: { color?: string | undefined; lineWidth?: number | undefined; dash?: LineDash | undefined }, field: string) => void;
    onDone: () => void;
  } = $props();

  const preview = (dash: LineDash) => {
    const p = LINE_DASHES[dash];
    return p ? p.map((n) => n * 3).join(' ') : undefined;
  };
</script>

<div class="line">
  <div class="field color">
    <span>{t('line.color')}</span>
    <div class="inline">
      <input
        type="color"
        value={shownColor}
        aria-label={t('line.color')}
        onchange={(e) => onChange({ color: e.currentTarget.value }, 'color')}
      />
      {#if value.color !== undefined}
        <IconButton icon={icons.close} label={t('line.reset')} size={14} onclick={() => onChange({ color: undefined }, 'color')} />
      {/if}
    </div>
  </div>
  <label class="field width">
    <span>{t('line.width')} <span class="muted">{value.width === null ? t('line.mixed') : `${shownWidth}px`}</span></span>
    <div class="inline">
      <input
        type="range"
        min={LINE_WIDTH_RANGE.min}
        max={LINE_WIDTH_RANGE.max}
        step="0.5"
        value={shownWidth}
        oninput={(e) => onChange({ lineWidth: Number(e.currentTarget.value) }, 'lineWidth')}
        onchange={onDone}
      />
      {#if value.width !== undefined}
        <IconButton icon={icons.close} label={t('line.reset')} size={14} onclick={() => onChange({ lineWidth: undefined }, 'lineWidth')} />
      {/if}
    </div>
  </label>
</div>
<div class="field">
  <span>{t('line.pattern')}</span>
  <div class="dashes" role="radiogroup" aria-label={t('line.pattern')}>
    <button type="button" class:active={value.dash === undefined} onclick={() => onChange({ dash: undefined }, 'dash')}>{t('line.modePattern')}</button>
    {#each LINE_DASH_ORDER as d (d)}
      <button type="button" class:active={value.dash === d} title={t(`line.dash.${d}`)} aria-label={t(`line.dash.${d}`)} onclick={() => onChange({ dash: d }, 'dash')}>
        <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
          <line x1="3" y1="5" x2="31" y2="5" stroke="currentColor" stroke-width="3" stroke-dasharray={preview(d)} stroke-linecap={d === 'solid' || d === 'dotted' ? 'round' : 'butt'} />
        </svg>
      </button>
    {/each}
  </div>
</div>

<style>
  .line {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color input {
    width: 44px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .width input {
    flex: 1;
    min-width: 0;
  }

  .dashes {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .dashes button {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 4px 2px;
    border: 0;
    background: var(--bg);
    color: var(--fg);
    font-size: 11px;
    cursor: pointer;
  }

  .dashes button + button {
    border-left: 1px solid var(--border);
  }

  .dashes button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
