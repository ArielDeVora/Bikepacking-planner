<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { ModuleContext } from '../../core/module';
  import { usAdvisories, type TripCountries, type UsAdvisories } from './advisories';

  let { ctx, countries, check, open }: { ctx: ModuleContext; countries: Readable<TripCountries>; check: () => void; open: (c: { code: string; name: string }) => void } =
    $props();
  const { t } = $derived(ctx);

  let us = $state<UsAdvisories | null>(null);
  $effect(() => void usAdvisories().then((d) => (us = d)));
</script>

<p class="muted small">{t('risk.intro')}</p>
{#if $countries.status === 'idle'}
  <button type="button" class="btn" onclick={check}>{t('risk.check')}</button>
{:else if $countries.status === 'loading'}
  <p class="muted small">{t('border.loading')}</p>
{:else if $countries.status === 'error'}
  <p class="small">{t('border.error')}</p>
  <button type="button" class="btn" onclick={check}>{t('border.retry')}</button>
{:else}
  <ul>
    {#each $countries.countries as c (c.code)}
      {@const level = us?.lookup(c.name)?.level}
      <li>
        <button type="button" onclick={() => open(c)}>
          <span class="label">{c.name}</span>
          {#if level}<span class="level l{level}" title={t(`risk.level.${level}` as 'risk.level.1')}>{level}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
  <p class="muted tiny">{t('risk.listHint')}</p>
{/if}

<style>
  .small {
    font-size: 12px;
  }

  .tiny {
    font-size: 11px;
  }

  p {
    margin: 0 0 6px;
  }

  .btn {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  li button:hover {
    background: var(--bg-hover);
  }

  .label {
    flex: 1;
  }

  .level {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }

  .l1 {
    background: #40c057;
  }

  .l2 {
    background: #fab005;
  }

  .l3 {
    background: #fd7e14;
  }

  .l4 {
    background: #e03131;
  }
</style>
