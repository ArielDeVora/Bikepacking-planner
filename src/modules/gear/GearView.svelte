<script lang="ts">
  import { untrack } from 'svelte';
  import { edits } from '../../core/commands';
  import type { StringKey } from '../../core/i18n';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Gear, GearStatus, Trip } from '../../model/types';
  import { CURRENCIES, currencyOf, formatMoney, inMain, moneyOf, rate, unknownRate, withRate } from './currency';
  import { download, safeFileName } from '../io/gpx';
  import {
    addGearCommand,
    bySection,
    GEAR_CATEGORIES,
    GEAR_STATUSES,
    gearList,
    matches,
    moveGearCommand,
    nextStatus,
    setGearCommand,
    spending,
    totalCost,
    toTable,
    totals,
    type GearFilter,
    type GearPatch,
  } from './gear';

  let { ctx, close }: { ctx: ModuleContext; close: () => void } = $props();
  const { t, commands, cloud } = $derived(ctx);
  const store = $derived(ctx.store);
  const members = $derived(ctx.cloud.members);
  const readOnly = $derived(ctx.readOnly ?? false);

  const people = $derived.by(() => {
    const list = $members.filter((m) => m.name || cloud.isMine(m.id)).map((m) => ({ id: m.id, name: cloud.isMine(m.id) ? t('collab.you') : m.name, color: m.color }));
    return list.length ? list : [{ id: ctx.user.id, name: t('collab.you'), color: 'var(--accent)' }];
  });
  const me = $derived(people.find((p) => cloud.isMine(p.id))?.id ?? ctx.user.id);
  /** My ids (this browser's and my account's) all mean me. */
  const norm = (id: string | undefined) => (id && cloud.isMine(id) ? me : id);
  const personOf = (id: string | undefined) => (id ? people.find((p) => p.id === norm(id)) : undefined);

  // Filters, remembered in this browser.
  let who = $state(untrack(() => ctx.settings.get<string>('who', 'all')));
  let status = $state(untrack(() => ctx.settings.get<GearStatus | 'all'>('status', 'all')));
  let sectionFilter = $state('');
  const filter = $derived<GearFilter>(who === 'all' ? { kind: 'all' } : who === 'shared' ? { kind: 'shared' } : { kind: 'person', id: who });
  $effect(() => {
    ctx.settings.set('who', who);
    ctx.settings.set('status', status);
  });

  const all = $derived.by(() => {
    void $store;
    return gearList(store);
  });
  // Currencies: each price keeps its own; totals and the cost split are in the trip's currency.
  const trip = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip');
  });
  const money = $derived(moneyOf(trip));
  const conv = (items: Gear[]) => items.map((g) => inMain(money, g));
  let myCurrency = $state(untrack(() => ctx.settings.get<string | null>('currency', null)));
  const newCurrency = $derived(myCurrency ?? money.main);
  function chooseMyCurrency(code: string) {
    myCurrency = code;
    ctx.settings.set('currency', code);
  }
  /** Currencies in use (and offered), the trip's first. */
  const used = $derived([...new Set(all.filter((g) => g.price !== undefined).map(currencyOf))].filter((c) => c !== money.main));
  const choices = $derived([...new Set([money.main, ...CURRENCIES, ...used])]);
  function setTrip(patch: Partial<Pick<Trip, 'currency' | 'currencyRates'>>) {
    if (!trip) return;
    commands.run({ label: t('gear.currencyEdit'), changes: [edits.update<Trip>(store, trip.id, patch)], mergeKey: `trip-money:${Object.keys(patch).join(',')}` });
  }
  function setRate(code: string, value: number) {
    const next = withRate(money, code, value);
    if (Object.keys(next).length) setTrip({ currencyRates: { ...trip?.currencyRates, ...next } });
  }
  const shownRate = (code: string) => Math.round(rate(money, code) * 10000) / 10000;

  const inSection = (g: Gear) => !sectionFilter || (g.category.trim() || '') === sectionFilter;
  const shown = $derived(all.filter((g) => matches(g, filter) && inSection(g) && (status === 'all' || g.status === status)));
  const sections = $derived(bySection(shown));
  const allSections = $derived(bySection(all).map(([sec]) => sec));
  const sum = $derived(totals(conv(all.filter((g) => matches(g, filter) && inSection(g)))));
  const report = $derived(
    spending(
      conv(all).map((g) => ({ ...g, boughtBy: norm(g.boughtBy), forId: norm(g.forId) })),
      people.map((p) => p.id),
    ),
  );
  const moneyRows = $derived(report.people.filter((s) => s.shared || s.personal || Math.abs(s.balance) > 0.005));
  const unassignedCost = $derived(report.unassigned.reduce((n, g) => n + totalCost(g), 0));

  const suggested = GEAR_CATEGORIES.map((k) => t(`gear.cat.${k}` as StringKey));
  const categories = $derived([...new Set([...all.map((g) => g.category).filter(Boolean), ...suggested])]);

  // New item.
  let name = $state('');
  let category = $state('');
  let forWhom = $state('shared');
  let newWeight = $state('');
  let newPrice = $state('');
  function add(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    const forIds = forWhom === 'shared' ? [null] : forWhom === 'everyone' ? people.map((p) => p.id) : [forWhom];
    commands.run(
      addGearCommand(store, {
        tripId: ctx.tripId,
        name,
        category: category || t('gear.cat.other'),
        forIds,
        weight: Number(newWeight) || undefined,
        price: Number(newPrice) || undefined,
        currency: newCurrency,
        label: t('gear.add'),
      }),
    );
    name = '';
    newWeight = '';
    newPrice = '';
  }

  function set(g: Gear, patch: GearPatch) {
    const cmd = setGearCommand(store, g.id, patch, me, t('gear.edit', { name: g.name }));
    if (cmd) commands.run(cmd);
  }
  const remove = (g: Gear) => commands.run({ label: t('gear.delete', { name: g.name }), changes: [edits.remove(store, g.id)] });
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

  const kg = (grams: number) => (grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`);
  const price = (n: number, code = money.main) => formatMoney(n, code);
  const sectionTotals = (items: Gear[]) => totals(conv(items));

  // Export: what's shown with the current filters.
  const decimalComma = (1.5).toLocaleString().includes(',');
  function tableRows() {
    const header = [
      t('gear.category'),
      t('gear.name'),
      t('gear.for'),
      t('gear.status'),
      t('gear.boughtBy'),
      t('gear.qty'),
      t('gear.weightEach'),
      t('gear.weightTotal'),
      t('gear.priceEach'),
      t('gear.currencyCol'),
      t('gear.priceTotalIn', { currency: money.main }),
      t('gear.notes'),
    ];
    const rows = shown.map((g) => [
      g.category || t('gear.cat.other'),
      g.name,
      personOf(g.forId)?.name ?? (g.forId ? t('collab.someone') : t('gear.forShared')),
      t(`gear.status.${g.status}` as StringKey),
      personOf(g.boughtBy)?.name ?? '',
      g.qty,
      g.weight ?? null,
      g.weight ? g.weight * (g.qty || 1) : null,
      g.price ?? null,
      g.price !== undefined ? currencyOf(g) : '',
      g.price ? totalCost(inMain(money, g)) : null,
      g.notes ?? '',
    ]);
    const s = totals(conv(shown));
    return [header, ...rows, [t('gear.total'), '', '', '', '', '', '', s.weight || null, '', '', s.price || null, '']];
  }
  function exportCsv() {
    const trip = store.get(ctx.tripId, 'trip')?.name || t('trip.defaultName');
    download(safeFileName(`${trip} - ${t('gear.title')}`, 'csv'), `\uFEFF${toTable(tableRows(), 'csv', decimalComma)}`, 'text/csv;charset=utf-8');
  }
  async function copyTable() {
    const text = toTable(tableRows(), 'tsv', decimalComma);
    try {
      await navigator.clipboard.writeText(text);
      ctx.ui.notify(t('gear.copied', { n: shown.length }));
    } catch {
      window.prompt(t('gear.copy'), text);
    }
  }

  // Dragging an item by its handle: before or after another item (a line shows where), or onto a
  // section's title (to the end of it). It takes the section it's dropped in.
  let armed = $state<string | null>(null);
  let dragging = $state<string | null>(null);
  let dropAt = $state<{ id: string; where: 'before' | 'after' } | { section: string } | null>(null);
  function dragStart(e: DragEvent, g: Gear) {
    dragging = g.id;
    e.dataTransfer?.setData('text/plain', g.name);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function overItem(e: DragEvent, g: Gear) {
    if (!dragging || dragging === g.id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = { id: g.id, where: e.clientY - r.top < r.height / 2 ? 'before' : 'after' };
  }
  function overSection(e: DragEvent, section: string) {
    if (!dragging) return;
    e.preventDefault();
    dropAt = { section };
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    const id = dragging;
    const to = dropAt;
    endDrag();
    if (!id || !to) return;
    const g = store.get(id, 'gear');
    const cmd = moveGearCommand(store, id, 'section' in to ? { section: to.section || t('gear.cat.other') } : to, t('gear.move', { name: g?.name ?? '' }));
    if (cmd) commands.run(cmd);
  }
  function endDrag() {
    armed = null;
    dragging = null;
    dropAt = null;
  }
  const dropClass = (g: Gear) => (dropAt && 'id' in dropAt && dropAt.id === g.id ? `drop-${dropAt.where}` : '');
</script>

<div class="gear">
  <header>
    <button type="button" class="back" onclick={close}><Icon d={icons.back} size={16} /> {t('plan.back')}</button>
    <h1>{t('gear.title')}</h1>
    <label>
      <span>{t('gear.who')}</span>
      <select bind:value={who}>
        <option value="all">{t('gear.whoAll')}</option>
        <option value="shared">{t('gear.whoShared')}</option>
        {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </label>
    <div class="chips" role="group" aria-label={t('gear.status')}>
      <button type="button" class:on={status === 'all'} onclick={() => (status = 'all')}>{t('gear.statusAll')} <b>{sum.items}</b></button>
      {#each GEAR_STATUSES as s (s)}
        <button type="button" class="s-{s}" class:on={status === s} onclick={() => (status = s)}>
          {t(`gear.status.${s}` as StringKey)} <b>{sum.byStatus[s]}</b>
        </button>
      {/each}
    </div>
    {#if allSections.length > 1}
      <label>
        <span>{t('gear.category')}</span>
        <select bind:value={sectionFilter}>
          <option value="">{t('gear.allSections')}</option>
          {#each allSections as sec (sec)}<option value={sec}>{sec || t('gear.cat.other')}</option>{/each}
        </select>
      </label>
    {/if}
    <span class="spacer"></span>
    {#if shown.length}
      <div class="export">
        <button type="button" onclick={exportCsv} title={t('gear.exportHint')}><Icon d={icons.download} size={14} /> {t('gear.export')}</button>
        <button type="button" onclick={copyTable} title={t('gear.copyHint')}><Icon d={icons.copy} size={14} /> {t('gear.copy')}</button>
      </div>
    {/if}
    <div class="sum">
      {#if sum.weight}<span>{kg(sum.weight)}</span>{/if}
      {#if sum.price}<span title={t('gear.totalHint')}>{price(sum.price)}</span>{/if}
      {#if sum.price - sum.spent > 0.005}<span class="muted" title={t('gear.spent', { amount: price(sum.spent) })}>{t('gear.toBuyTotal', { amount: price(sum.price - sum.spent) })}</span>{/if}
    </div>
  </header>

  <div class="body">
    <main>
      {#if !readOnly}
        <form class="add" onsubmit={add}>
          <input class="name" placeholder={t('gear.newName')} bind:value={name} aria-label={t('gear.name')} />
          <input placeholder={t('gear.category')} list="gear-categories" bind:value={category} aria-label={t('gear.category')} />
          <input class="num" type="number" min="0" step="10" placeholder={t('gear.weightEach')} bind:value={newWeight} aria-label={t('gear.weightEach')} />
          <span class="money-in">
            <input class="num" type="number" min="0" step="0.01" placeholder={t('gear.priceEach')} bind:value={newPrice} aria-label={t('gear.priceEach')} />
            <select value={newCurrency} aria-label={t('gear.myCurrency')} title={t('gear.myCurrency')} onchange={(e) => chooseMyCurrency(e.currentTarget.value)}>
              {#each choices as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </span>
          <select bind:value={forWhom} aria-label={t('gear.for')}>
            <option value="shared">{t('gear.forShared')}</option>
            {#if people.length > 1}<option value="everyone">{t('gear.forEveryone')}</option>{/if}
            {#each people as p (p.id)}<option value={p.id}>{t('gear.forPerson', { name: p.name })}</option>{/each}
          </select>
          <button type="submit" disabled={!name.trim()}><Icon d={icons.plus} size={14} /> {t('gear.addButton')}</button>
        </form>
      {/if}
      <datalist id="gear-categories">
        {#each categories as c (c)}<option value={c}></option>{/each}
      </datalist>

      {#if !all.length}
        <p class="empty">{t('gear.empty')}</p>
      {:else if !shown.length}
        <p class="empty">{t('gear.noMatch')}</p>
      {/if}

      {#each sections as [section, items] (section)}
        {@const st = sectionTotals(items)}
        <section>
          <h2 class:drop-into={dropAt && 'section' in dropAt && dropAt.section === section} ondragover={(e) => overSection(e, section)} ondrop={drop}>
            {section || t('gear.cat.other')} <span class="muted">{items.length}{st.weight ? ` · ${kg(st.weight)}` : ''}{st.price ? ` · ${price(st.price)}` : ''}</span></h2>
          <div class="cols" aria-hidden="true">
            <span></span><span>{t('gear.status')}</span><span>{t('gear.name')}</span><span>{t('gear.for')}</span><span>{t('gear.boughtBy')}</span>
            <span>{t('gear.qty')}</span><span>{t('gear.weight')}</span><span>{t('gear.price')}</span><span>{t('gear.notes')}</span><span></span>
          </div>
          <ul>
            {#each items as g (g.id)}
              {@const owner = personOf(g.forId)}
              {@const buyer = personOf(g.boughtBy)}
              <li
                class="row {dropClass(g)}"
                class:done={g.status === 'packed'}
                class:dragged={dragging === g.id}
                draggable={armed === g.id}
                ondragstart={(e) => dragStart(e, g)}
                ondragover={(e) => overItem(e, g)}
                ondrop={drop}
                ondragend={endDrag}
              >
                <span
                  class="grip"
                  class:off={readOnly}
                  role="presentation"
                  title={readOnly ? undefined : t('gear.dragHint')}
                  onpointerdown={() => !readOnly && (armed = g.id)}
                  onpointerup={() => !dragging && (armed = null)}
                >
                  <Icon d={icons.grip} size={14} />
                </span>
                <button
                  type="button"
                  class="status s-{g.status}"
                  disabled={readOnly}
                  title={t('gear.nextStatus')}
                  onclick={() => set(g, { status: nextStatus(g.status) })}
                >
                  {t(`gear.status.${g.status}` as StringKey)}
                </button>
                <input class="name" value={g.name} disabled={readOnly} aria-label={t('gear.name')} onchange={(e) => e.currentTarget.value.trim() && set(g, { name: e.currentTarget.value.trim() })} />
                <span class="who for">
                  {#if owner}<span class="dot" style:background={owner.color}></span>{/if}
                  <select value={norm(g.forId) ?? ''} disabled={readOnly} aria-label={t('gear.for')} onchange={(e) => set(g, { forId: e.currentTarget.value })}>
                    <option value="">{t('gear.forShared')}</option>
                    {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
                  </select>
                </span>
                <span class="who buyer">
                  {#if buyer}<span class="dot" style:background={buyer.color}></span>{/if}
                  <select value={norm(g.boughtBy) ?? ''} disabled={readOnly} aria-label={t('gear.boughtBy')} onchange={(e) => set(g, { boughtBy: e.currentTarget.value })}>
                    <option value="">—</option>
                    {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
                  </select>
                </span>
                <input class="qty" type="number" min="1" step="1" value={g.qty} disabled={readOnly} aria-label={t('gear.qty')} onchange={(e) => set(g, { qty: Math.max(1, Math.round(num(e.currentTarget.value)) || 1) })} />
                <input class="weight" type="number" min="0" step="10" value={g.weight ?? ''} placeholder="g" disabled={readOnly} aria-label={t('gear.weight')} onchange={(e) => set(g, { weight: num(e.currentTarget.value) })} />
                <span class="price money-in">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={g.price ?? ''}
                    title={g.qty > 1 && g.price ? t('gear.lineTotal', { qty: g.qty, amount: price(totalCost(g), currencyOf(g)) }) : undefined}
                    disabled={readOnly}
                    aria-label={t('gear.price')}
                    onchange={(e) => set(g, { price: num(e.currentTarget.value), ...(g.currency ? {} : { currency: currencyOf(g) }) })}
                  />
                  <select value={currencyOf(g)} disabled={readOnly} aria-label={t('gear.itemCurrency')} onchange={(e) => set(g, { currency: e.currentTarget.value })}>
                    {#each choices.includes(currencyOf(g)) ? choices : [...choices, currencyOf(g)] as c (c)}<option value={c}>{c}</option>{/each}
                  </select>
                </span>
                <span class="notes">
                  <input value={g.notes ?? ''} placeholder={t('gear.notes')} disabled={readOnly} aria-label={t('gear.notes')} onchange={(e) => set(g, { notes: e.currentTarget.value.trim() })} />
                  <input class="cat" value={g.category} list="gear-categories" disabled={readOnly} aria-label={t('gear.category')} title={t('gear.category')} onchange={(e) => set(g, { category: e.currentTarget.value.trim() })} />
                </span>
                <span class="del">{#if !readOnly}<IconButton icon={icons.trash} label={t('gear.deleteButton')} size={14} onclick={() => remove(g)} />{/if}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </main>

    {#if moneyRows.length || report.unassigned.length || all.some((g) => g.price !== undefined)}
      <aside>
        <h2>{t('gear.money')}</h2>
        <label class="main-currency">
          <span>{t('gear.totalsIn')}</span>
          <select value={money.main} disabled={readOnly} onchange={(e) => setTrip({ currency: e.currentTarget.value })}>
            {#each choices as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </label>
        {#if used.length}
          <div class="rates">
            <span class="muted">{t('gear.rates')}</span>
            {#each used as c (c)}
              <label class="rate" class:unknown={unknownRate(money, c)}>
                <span>1 {c} =</span>
                <input type="number" min="0" step="0.0001" value={unknownRate(money, c) ? '' : shownRate(c)} disabled={readOnly} onchange={(e) => setRate(c, Number(e.currentTarget.value))} />
                <span>{money.main}</span>
              </label>
            {/each}
            <p class="muted small">{t('gear.ratesHint')}</p>
          </div>
        {/if}
        <p class="muted">{t('gear.moneyHint')}</p>
        {#if report.unassigned.length}
          <p class="warn-box">
            {t('gear.unassigned', { names: report.unassigned.map((g) => g.name).join(', '), amount: price(unassignedCost) })}
          </p>
        {/if}
        <ul class="money">
          {#each moneyRows as s (s.userId)}
            {@const p = personOf(s.userId)}
            <li>
              <span class="dot" style:background={p?.color ?? 'var(--fg-muted)'}></span>
              <strong>{p?.name ?? t('collab.someone')}</strong>
              <span class="muted">{t('gear.paid', { shared: price(s.shared), personal: price(s.personal) })}</span>
              <span class="balance" class:plus={s.balance > 0.005} class:minus={s.balance < -0.005}>
                {s.balance > 0.005 ? t('gear.owed', { amount: price(s.balance) }) : s.balance < -0.005 ? t('gear.owes', { amount: price(-s.balance) }) : t('gear.even')}
              </span>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
  </div>
</div>

<style>
  .gear {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    gap: 10px;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 14px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  h1 {
    margin: 0 8px 4px 0;
    font-size: 16px;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }

  label {
    display: grid;
    gap: 2px;
    font-size: 11px;
    color: var(--fg-muted);
  }

  input,
  select {
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
  }

  input:disabled,
  select:disabled {
    opacity: 1;
    border-color: transparent;
    background: none;
    appearance: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chips button {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .chips button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .chips b {
    margin-left: 2px;
    font-weight: 600;
    color: var(--fg-muted);
  }

  .spacer {
    flex: 1;
  }

  .sum {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 10px;
  }

  main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  aside {
    width: 280px;
    flex: none;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 12px;
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  .add .name {
    flex: 1 1 200px;
  }

  .add input:not(.name),
  .add select {
    flex: 0 1 180px;
  }

  .add .num {
    flex: 0 1 110px;
  }

  .add button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-fg);
    font: inherit;
    cursor: pointer;
  }

  .add button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .empty {
    color: var(--fg-muted);
  }

  section {
    margin-bottom: 16px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 13px;
  }

  .muted {
    font-weight: 400;
    color: var(--fg-muted);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cols,
  .row {
    display: grid;
    grid-template-columns: 16px 76px minmax(110px, 2fr) minmax(90px, 1fr) minmax(90px, 1fr) 52px 100px 132px minmax(100px, 1.5fr) 28px;
    align-items: center;
    gap: 6px;
  }

  .cols {
    padding: 0 0 2px;
    white-space: nowrap;
    font-size: 11px;
    color: var(--fg-muted);
  }

  .row {
    padding: 3px 0;
    border-top: 1px solid var(--border);
  }

  .row.dragged {
    opacity: 0.4;
  }

  .row.drop-before {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .row.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  h2.drop-into {
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
  }

  .grip {
    display: flex;
    justify-content: center;
    color: var(--fg-muted);
    cursor: grab;
    touch-action: none;
  }

  .grip.off {
    visibility: hidden;
  }

  .export {
    display: flex;
    gap: 4px;
    margin-bottom: 2px;
  }

  .export button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .export button:hover {
    background: var(--bg-hover);
  }

  .money-in {
    display: flex;
    gap: 2px;
    min-width: 0;
  }

  .money-in input {
    flex: 1;
    min-width: 0;
  }

  .money-in select {
    flex: none;
    width: 62px;
    padding-inline: 2px;
    font-size: 12px;
  }

  .add .money-in {
    flex: 0 1 180px;
  }

  .main-currency {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0;
    font-size: 12px;
    color: var(--fg);
  }

  .main-currency span {
    white-space: nowrap;
  }

  .main-currency select {
    flex: none;
    width: auto;
  }

  .rates {
    display: grid;
    gap: 4px;
    margin: 6px 0 10px;
  }

  .rate {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fg);
  }

  .rate input {
    width: 90px;
  }

  .rate.unknown input {
    border-color: var(--warn);
  }

  .small {
    margin: 0;
    font-size: 11px;
  }

  .warn-box {
    margin: 8px 0;
    padding: 8px;
    border-left: 3px solid var(--warn);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 12%, var(--bg));
  }

  .row.done .name {
    text-decoration: line-through;
    color: var(--fg-muted);
  }

  .status {
    padding: 3px 0;
    border: 1px solid transparent;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .status:disabled {
    cursor: default;
  }

  .s-needed.status {
    border-color: var(--border);
    background: var(--bg);
    color: var(--fg-muted);
  }

  .s-bought.status {
    background: color-mix(in srgb, var(--warn) 25%, var(--bg));
    color: var(--fg);
  }

  .s-packed.status {
    background: color-mix(in srgb, #2e9e5b 25%, var(--bg));
    color: var(--fg);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .who select {
    flex: 1;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .notes {
    display: flex;
    gap: 4px;
    min-width: 0;
  }

  .notes input {
    flex: 1;
  }

  .notes .cat {
    flex: 0 1 90px;
    font-size: 11px;
    color: var(--fg-muted);
  }

  .money li {
    display: grid;
    grid-template-columns: 8px 1fr;
    align-items: center;
    gap: 2px 6px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }

  .money .muted,
  .money .balance {
    grid-column: 2;
  }

  .balance.plus {
    color: #2e9e5b;
    font-weight: 600;
  }

  .balance.minus {
    color: var(--danger);
    font-weight: 600;
  }

  @media (max-width: 1180px) {
    .body {
      flex-direction: column;
      overflow-y: auto;
    }

    main {
      flex: none;
      overflow: visible;
    }

    aside {
      width: auto;
    }
  }

  @media (max-width: 640px) {
    .gear {
      padding: calc(var(--safe-top) + 6px) 6px calc(var(--safe-bottom) + 6px);
      gap: 6px;
    }

    header {
      gap: 6px 10px;
      padding: 8px 10px;
    }

    main {
      padding: 10px;
    }

    .cols {
      display: none;
    }

    .row {
      grid-template-columns: 16px 76px 1fr 1fr 28px;
      grid-template-areas:
        'grip status name name del'
        'grip for for buyer buyer'
        'grip qty weight price price'
        'grip notes notes notes notes';
      padding: 8px 0;
    }

    .row > .grip {
      grid-area: grip;
    }

    .row > .status {
      grid-area: status;
    }

    .row > .name {
      grid-area: name;
    }

    .row > .for {
      grid-area: for;
    }

    .row > .buyer {
      grid-area: buyer;
    }

    .row > .qty {
      grid-area: qty;
    }

    .row > .weight {
      grid-area: weight;
    }

    .row > .price {
      grid-area: price;
    }

    .row > .notes {
      grid-area: notes;
    }

    .row > .del {
      grid-area: del;
    }
  }
</style>
