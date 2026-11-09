<script lang="ts">
  import type { t as translate } from '../../core/i18n';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { Stats } from './stats';

  let { t, stats, showStages = false }: { t: typeof translate; stats: Stats; showStages?: boolean } = $props();

  const km = (m: number) => (m / 1000).toLocaleString(undefined, { maximumFractionDigits: m < 100_000 ? 1 : 0 });
  const date = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

{#if stats.byMode.length}
  <table>
    <tbody>
      {#each stats.byMode as m (m.mode)}
        <tr>
          <td class="mode"><Icon d={icons[m.mode]} size={14} /> {t(`mode.${m.mode}`)}</td>
          <td class="num">{km(m.lengthM)} km</td>
          <td class="num muted">{m.ascentM ? `↗ ${m.ascentM.toLocaleString()} m` : ''}</td>
        </tr>
      {/each}
      {#if stats.byMode.length > 1}
        <tr class="total">
          <td>{t('stats.total')}</td>
          <td class="num">{km(stats.lengthM)} km</td>
          <td class="num muted"></td>
        </tr>
      {/if}
    </tbody>
  </table>
{:else}
  <p class="muted small">{t('stats.empty')}</p>
{/if}
<dl>
  {#if stats.ascentM}
    <div><dt>{t('stats.climb')}</dt><dd>{stats.ascentM.toLocaleString()} m</dd></div>
  {/if}
  {#if showStages}
    <div><dt>{t('stats.stages')}</dt><dd>{stats.stages}</dd></div>
  {/if}
  {#if stats.days}
    <div>
      <dt>{t('stats.days')}</dt>
      <dd>{stats.days.count} <span class="muted small">({date(stats.days.from)} – {date(stats.days.to)})</span></dd>
    </div>
  {/if}
</dl>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  td {
    padding: 3px 0;
  }

  .mode {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding-left: 8px;
  }

  .total td {
    border-top: 1px solid var(--border);
    font-weight: 600;
  }

  dl {
    display: grid;
    gap: 2px;
    margin: 6px 0 0;
    font-size: 13px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  dt {
    color: var(--fg-muted);
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .small {
    font-size: 12px;
  }
</style>
