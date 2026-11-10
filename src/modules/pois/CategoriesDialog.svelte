<script lang="ts">
  import { untrack } from 'svelte';
  import { POI_CATEGORIES, POI_CATEGORY_ORDER } from '../../config/pois';
  import type { ModuleContext } from '../../core/module';
  import { customCategories, iconPath, replaceCategoriesCommand, replacements, suggestReplacement } from '../../lib/places/categories';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { PoiCategory } from '../../model/types';

  let { ctx, focusOn }: { ctx: ModuleContext; focusOn?: string } = $props();
  const { t, store, commands, ui } = untrack(() => ctx);

  const custom = customCategories(store).map((f) => ({ id: f.id, name: f.name || t('category.untitled'), color: f.color ?? '#868e96', icon: iconPath(f.icon) }));
  const current = replacements(store);
  const counts = new Map<string, number>();
  for (const p of store.list('poi')) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  const name = (id: PoiCategory) => t(`poi.cat.${id}`);
  // Each built-in category: its current replacement, else one of ours with a matching name, else kept.
  const rows = POI_CATEGORY_ORDER.map((id) => {
    const suggestion = current[id] ? null : suggestReplacement(name(id), custom);
    return { id, suggestion, initial: current[id] ?? suggestion ?? '' };
  });
  let choices = $state<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.id, r.initial])));

  const others = (id: PoiCategory) => POI_CATEGORY_ORDER.filter((b) => b !== id && !choices[b]);

  function apply() {
    const cmd = replaceCategoriesCommand(
      store,
      Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, v || null])),
      t('cmd.replaceCategories'),
    );
    if (cmd) commands.run(cmd);
    ui.closeDialog();
  }
</script>

<div class="manage dialog-sized">
  <h2>{t('category.manage')}</h2>
  <p class="intro muted">{t('category.manageIntro')}</p>

  <ul>
    {#each rows as row (row.id)}
      {@const c = POI_CATEGORIES[row.id]}
      {@const n = counts.get(row.id) ?? 0}
      <li class:focus={focusOn === row.id} class:replaced={!!choices[row.id]}>
        <span class="badge" style:background={c.color}><Icon d={c.icon} size={12} /></span>
        <span class="name">
          {name(row.id)}
          {#if n}<span class="muted small">· {t('category.placesIn', { n })}</span>{/if}
        </span>
        <span class="choice">
          {#if row.suggestion && choices[row.id] === row.suggestion}<span class="suggested">{t('category.suggested')}</span>{/if}
          <select bind:value={choices[row.id]} aria-label={name(row.id)}>
            <option value="">{t('category.keep')}</option>
            {#if custom.length}
              <optgroup label={`${t('category.replaceWith')}: ${t('category.custom').toLowerCase()}`}>
                {#each custom as cat (cat.id)}<option value={cat.id}>{cat.name}</option>{/each}
              </optgroup>
            {/if}
            <optgroup label={`${t('category.replaceWith')}: ${t('category.manage').toLowerCase()}`}>
              {#each others(row.id) as b (b)}<option value={b}>{name(b)}</option>{/each}
            </optgroup>
          </select>
        </span>
      </li>
    {/each}
  </ul>

  <div class="buttons">
    <button type="button" class="btn" onclick={() => ui.closeDialog()}>{t('category.cancel')}</button>
    <button type="button" class="btn primary" onclick={apply}>{t('category.apply')}</button>
  </div>
</div>

<style>
  .manage {
    width: min(520px, calc(100vw - 72px));
  }

  h2 {
    margin: 0 0 6px;
    font-size: 16px;
  }

  .intro {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.45;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px;
    border-radius: var(--radius-sm);
  }

  li.focus {
    background: var(--accent-soft);
  }

  li.replaced .name {
    text-decoration: line-through;
    color: var(--fg-muted);
  }

  .badge {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #fff;
  }

  .name {
    flex: 1;
    min-width: 0;
  }

  .small {
    font-size: 12px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }

  .suggested {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11px;
  }

  select {
    max-width: 190px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }
</style>
