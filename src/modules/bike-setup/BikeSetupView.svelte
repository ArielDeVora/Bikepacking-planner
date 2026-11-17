<script lang="ts">
  import { untrack } from 'svelte';
  import type { StringKey } from '../../core/i18n';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import type { Gear } from '../../model/types';
  import { gearList } from '../gear/gear';
  import BikeDrawing from './BikeDrawing.svelte';
  import { PART_COLORS } from './look';
  import {
    assign,
    gearGrams,
    isMounted,
    isOwned,
    link,
    loading,
    mount,
    ON_ME,
    partDef,
    partOfCarrier,
    PARTS,
    readSetup,
    setBike,
    setOwned,
    setRider,
    setVariant,
    setWeight,
    unmount,
    variantOf,
    warnings,
    type Load,
    type PartId,
    type Setup,
  } from './setup';

  let { ctx, close }: { ctx: ModuleContext; close: () => void } = $props();
  const { t, cloud } = $derived(ctx);
  const store = $derived(ctx.store);

  // Saved in this browser only, one setup per trip.
  const key = untrack(() => `setup:${ctx.tripId}`);
  let setup = $state<Setup>(untrack(() => readSetup(ctx.settings.get(key, null))));
  let withShared = $state(untrack(() => ctx.settings.get<boolean>('withShared', false)));
  $effect(() => ctx.settings.set(key, $state.snapshot(setup)));
  $effect(() => ctx.settings.set('withShared', withShared));

  const mine = (id: string | undefined) => !!id && cloud.isMine(id);
  const all = $derived.by(() => {
    void $store;
    return gearList(store);
  });
  const gear = $derived(all.filter((g) => mine(g.forId) || mine(g.boughtBy) || (withShared && !g.forId)));
  const load = $derived(loading(setup, gear, all));
  /** The gear item each part is, when linked. */
  const bagOf = (id: PartId) => {
    const gid = setup.parts[id]?.gearId;
    return gid ? all.find((g) => g.id === gid) : undefined;
  };
  const placed = $derived(gear.length - load.loose.length);
  const loads = $derived(new Map(load.carriers.map((l) => [l.carrier, l])));
  const myGrams = $derived(gear.reduce((n, g) => n + gearGrams(g), 0));
  const unweighed = $derived(gear.filter((g) => g.weight === undefined).length);
  const warns = $derived(warnings(setup));

  /** Parts that carry gear and are on the bike, numbered as on the drawing. */
  const carrying = $derived(PARTS.filter((p) => p.carriers.length && isMounted(setup, p.id)));
  const numbers = $derived(new Map(carrying.map((p, i) => [p.id, i + 1])));
  const shelf = $derived(PARTS.filter((p) => isOwned(setup, p.id) && !isMounted(setup, p.id)));

  const partName = (id: PartId) => t(`bike.part.${id}` as StringKey);
  const sideName = (carrier: string) => {
    const side = partOfCarrier(carrier)?.carriers.find((c) => c.id === carrier)?.side;
    return side ? t(`bike.side.${side}` as StringKey) : '';
  };
  const label = (id: PartId, carrier?: string) => {
    const l = carrier ? loads.get(carrier) : undefined;
    const side = carrier ? sideName(carrier) : '';
    const name = side ? `${partName(id)} (${side.toLowerCase()})` : partName(id);
    return l ? `${name}: ${kg(l.total)}` : name;
  };
  const kg = (grams: number) => (grams >= 1000 ? `${(grams / 1000).toFixed(2).replace(/\.?0+$/, '')} kg` : `${Math.round(grams)} g`);

  // Drag and drop: what is being dragged, kept here since dragover can't read the data.
  let drag = $state<{ kind: 'gear'; id: string } | { kind: 'part'; id: PartId; from: 'shelf' | 'bike' } | null>(null);
  let hot = $state<PartId | null>(null);
  let snapped = $state<PartId | null>(null);
  let overCarrier = $state<string | null>(null);
  let overShelf = $state(false);
  let overLoose = $state(false);
  let overSlot = $state<PartId | null>(null);

  function start(e: DragEvent, d: NonNullable<typeof drag>) {
    drag = d;
    e.dataTransfer?.setData('text/plain', d.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function end() {
    drag = null;
    overCarrier = null;
    overShelf = false;
    overLoose = false;
    overSlot = null;
  }

  const ghosts = $derived.by<PartId[]>(() => {
    if (drag?.kind !== 'part' || drag.from !== 'shelf') return [];
    const needs = partDef(drag.id).needs;
    return needs && !isMounted(setup, needs) ? [drag.id, needs] : [drag.id];
  });

  function putOn(id: PartId) {
    const r = mount(setup, id);
    if (r.needs) {
      ctx.ui.notify(t('bike.needs', { part: partName(id), rack: partName(r.needs).toLowerCase() }), 'warn');
      return;
    }
    setup = r.setup;
    snapped = id;
    setTimeout(() => {
      if (snapped === id) snapped = null;
    }, 400);
  }
  const takeOff = (id: PartId) => (setup = unmount(setup, id));
  const place = (gearId: string, carrier: string | null) => (setup = assign(setup, gearId, carrier));

  function dropOnBike() {
    if (drag?.kind === 'part' && drag.from === 'shelf') putOn(drag.id);
    end();
  }
  function dropGear(carrier: string | null) {
    if (drag?.kind === 'gear') place(drag.id, carrier);
    end();
  }
  function dropBag(id: PartId) {
    if (drag?.kind === 'gear') setup = link(setup, id, drag.id);
    end();
  }
  function allowGear(e: DragEvent) {
    if (drag?.kind !== 'gear') return false;
    e.preventDefault();
    return true;
  }
  function overShelfZone(e: DragEvent) {
    if (drag?.kind === 'part' && drag.from === 'bike') {
      e.preventDefault();
      overShelf = true;
    }
  }
  function dropShelf() {
    if (drag?.kind === 'part' && drag.from === 'bike') takeOff(drag.id);
    end();
  }

  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)) || 0);
  const kgInput = (v: string) => {
    const n = num(v.replace(',', '.'));
    return n === undefined ? undefined : Math.round(n * 1000);
  };
  const kgValue = (grams: number | undefined) => (grams === undefined ? '' : String(Math.round(grams / 100) / 10));
  const loadedBike = $derived(load.total + (setup.bike ?? 0));
  const everything = $derived(loadedBike + load.onMe.weight + (setup.rider ?? 0));
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const groups = ['racks', 'bags', 'cages'] as const;

  /** Bars in the weight summary, relative to the heaviest bag. */
  const heaviest = $derived(Math.max(1, ...load.carriers.map((l) => l.total), ...load.hardware.map((h) => h.weight)));
</script>

{#snippet item(g: Gear, carrier: string | null)}
  <li
    class="item"
    class:dragging={drag?.kind === 'gear' && drag.id === g.id}
    draggable="true"
    ondragstart={(e) => start(e, { kind: 'gear', id: g.id })}
    ondragend={end}
  >
    <Icon d={icons.grip} size={12} />
    <span class="name" title={g.name}>{g.name}{#if g.qty > 1}<span class="muted"> ×{g.qty}</span>{/if}</span>
    <span class="w" class:none={g.weight === undefined}>{g.weight === undefined ? t('bike.noWeight') : kg(gearGrams(g))}</span>
    {#if carrier}
      <button type="button" class="x" title={t('bike.unplace')} aria-label={t('bike.unplace')} onclick={() => place(g.id, null)}>
        <Icon d={icons.close} size={11} />
      </button>
    {/if}
  </li>
{/snippet}

{#snippet bagSlot(id: PartId)}
  {@const bag = bagOf(id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="slot"
    class:over={overSlot === id}
    class:ready={drag?.kind === 'gear' && !bag}
    title={t('bike.slotHint')}
    ondragover={(e) => allowGear(e) && (overSlot = id)}
    ondragleave={() => overSlot === id && (overSlot = null)}
    ondrop={(e) => {
      e.preventDefault();
      dropBag(id);
    }}
  >
    {#if bag}
      <span
        class="linked"
        class:dragging={drag?.kind === 'gear' && drag.id === bag.id}
        draggable="true"
        role="listitem"
        ondragstart={(e) => start(e, { kind: 'gear', id: bag.id })}
        ondragend={end}
      >
        <Icon d={icons.tag} size={11} />
        <span class="name" title={bag.name}>{bag.name}{#if bag.qty > 1}<span class="muted"> ×{bag.qty}</span>{/if}</span>
        <b>{bag.weight === undefined ? t('bike.noWeight') : kg(gearGrams(bag))}</b>
        <button type="button" class="x" title={t('bike.unlink')} aria-label={t('bike.unlink')} onclick={() => (setup = link(setup, id, null))}>
          <Icon d={icons.close} size={10} />
        </button>
      </span>
    {:else}
      <span class="muted">{partDef(id).group === 'racks' ? t('bike.slotRack') : partDef(id).group === 'cages' ? t('bike.slotCage') : t('bike.slotBag')}</span>
    {/if}
  </div>
{/snippet}

{#snippet bagList(l: Load)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="drop"
    class:over={overCarrier === l.carrier}
    class:ready={drag?.kind === 'gear'}
    ondragover={(e) => allowGear(e) && (overCarrier = l.carrier)}
    ondragleave={() => overCarrier === l.carrier && (overCarrier = null)}
    ondrop={(e) => {
      e.preventDefault();
      dropGear(l.carrier);
    }}
  >
    {#if l.side}<div class="side">{sideName(l.carrier)} <b>{kg(l.total)}</b></div>{/if}
    {#if l.items.length}
      <ul>
        {#each l.items as g (g.id)}{@render item(g, l.carrier)}{/each}
      </ul>
    {:else}
      <p class="muted hint">{t('bike.dropHere')}</p>
    {/if}
  </div>
{/snippet}

<div class="setup">
  <header>
    <button type="button" class="back" onclick={close}><Icon d={icons.back} size={16} /> {t('plan.back')}</button>
    <h1>{t('bike.title')}</h1>
    <span class="muted local">{t('bike.local')}</span>
    <span class="spacer"></span>
    <div class="sum">
      <span title={t('bike.total')}><Icon d={icons.bike} size={14} /> {kg(load.total)}</span>
      {#if load.loose.length}<span class="muted">{t('bike.toPlace', { n: load.loose.length })}</span>{/if}
    </div>
  </header>

  <div class="body">
    <aside>
      <section class="card">
        <h2>{t('bike.parts')}</h2>
        <p class="muted small">{t('bike.partsHint')}</p>
        {#each groups as group (group)}
          <h3>{t(`bike.group.${group}` as StringKey)}</h3>
          <ul class="parts">
            {#each PARTS.filter((p) => p.group === group) as p (p.id)}
              {@const st = setup.parts[p.id]}
              <li class:owned={st?.owned}>
                <label class="check">
                  <input type="checkbox" checked={!!st?.owned} onchange={(e) => (setup = setOwned(setup, p.id, e.currentTarget.checked))} />
                  <span class="dot" style:background={PART_COLORS[p.id]}></span>
                  <span>{partName(p.id)}</span>
                  {#if st?.mounted}<span class="on-bike">{t('bike.onBikeTag')}</span>{/if}
                </label>
                {#if st?.owned}
                  <div class="opts">
                    {#if p.variants}
                      <div class="seg" role="group">
                        {#each p.variants as v (v)}
                          <button type="button" class:on={variantOf(setup, p.id) === v} onclick={() => (setup = setVariant(setup, p.id, v))}>
                            {t(`bike.variant.${v}` as StringKey)}
                          </button>
                        {/each}
                      </div>
                    {/if}
                    {#if bagOf(p.id)}
                      {@const bag = bagOf(p.id)!}
                      <span class="linked" title={t('bike.linkedHint')}>
                        <Icon d={icons.tag} size={11} />
                        <span class="name">{bag.name}</span>
                        <b>{bag.weight === undefined ? t('bike.noWeight') : kg(gearGrams(bag))}</b>
                      </span>
                    {:else}
                      <label class="weight" title={p.carriers.length > 1 ? t('bike.weightEachHint') : t('bike.weightHint')}>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          placeholder={`≈${p.typical}`}
                          value={st.weight ?? ''}
                          onchange={(e) => (setup = setWeight(setup, p.id, num(e.currentTarget.value)))}
                        />
                        <span class="muted">{p.carriers.length > 1 ? t('bike.gEach') : 'g'}</span>
                      </label>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      </section>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <section
        class="card gear"
        class:over={overLoose}
        ondragover={(e) => {
          if (drag?.kind === 'gear' && setup.assign[drag.id]) {
            e.preventDefault();
            overLoose = true;
          }
        }}
        ondragleave={() => (overLoose = false)}
        ondrop={(e) => {
          e.preventDefault();
          dropGear(null);
        }}
      >
        <h2>{t('bike.myGear')}</h2>
        <div class="stats">
          <div><b>{gear.length}</b><span class="muted">{t('bike.items')}</span></div>
          <div><b>{kg(myGrams)}</b><span class="muted">{t('bike.weighs')}</span></div>
          <div><b>{kg(myGrams - load.loose.reduce((n, g) => n + gearGrams(g), 0) - load.onMe.weight)}</b><span class="muted">{t('bike.packed')}</span></div>
        </div>
        {#if gear.length}
          <div class="progress" title={t('bike.placedOf', { n: placed, of: gear.length })}>
            <span style:width="{(placed / gear.length) * 100}%"></span>
          </div>
        {/if}
        {#if unweighed}<p class="muted small">{t('bike.unweighed', { n: unweighed })}</p>{/if}
        <label class="check small">
          <input type="checkbox" bind:checked={withShared} />
          <span>{t('bike.withShared')}</span>
        </label>
        {#if !gear.length}
          <p class="muted small">{t('bike.noGear')}</p>
        {:else if !load.loose.length}
          <p class="muted small done">{t('bike.allPlaced')}</p>
        {:else}
          <p class="muted small">{carrying.length ? t('bike.dragGear') : t('bike.mountFirst')}</p>
          <ul class="loose">
            {#each load.loose as g (g.id)}{@render item(g, null)}{/each}
          </ul>
        {/if}
      </section>
    </aside>

    <main>
      <section class="card stage">
        <BikeDrawing
          {setup}
          {loads}
          {numbers}
          {ghosts}
          {hot}
          {snapped}
          gearDragging={drag?.kind === 'gear'}
          partDragging={drag?.kind === 'part' && drag.from === 'shelf'}
          {label}
          alt={t('bike.title')}
          onGearDrop={(c) => dropGear(c)}
          onPartDrop={dropOnBike}
          onHover={(p) => (hot = p)}
        />
        {#each warns as w (w)}<p class="warn">{t(`bike.warn.${w}` as StringKey)}</p>{/each}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="shelf" class:over={overShelf} class:ready={drag?.kind === 'part' && drag.from === 'bike'} ondragover={overShelfZone} ondragleave={() => (overShelf = false)} ondrop={dropShelf}>
          <span class="muted shelf-title">{t('bike.shelf')}</span>
          {#each shelf as p (p.id)}
            <button
              type="button"
              class="tile"
              draggable="true"
              title={t('bike.tileHint')}
              ondragstart={(e) => start(e, { kind: 'part', id: p.id, from: 'shelf' })}
              ondragend={end}
              onclick={() => putOn(p.id)}
            >
              <span class="dot" style:background={PART_COLORS[p.id]}></span>
              {partName(p.id)}{#if p.variants}<span class="muted"> · {t(`bike.variant.${variantOf(setup, p.id)}` as StringKey)}</span>{/if}
            </button>
          {:else}
            <span class="muted small">{PARTS.some((p) => isOwned(setup, p.id)) ? t('bike.shelfAllOn') : t('bike.shelfEmpty')}</span>
          {/each}
        </div>
      </section>

      <section class="cards">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <article class="bag-card me" title={t('bike.onMeHint')}>
            <header class="static">
              <span class="me-icon"><Icon d={icons.person} size={13} /></span>
              <strong>{t('bike.onMe')}</strong>
              <span class="spacer"></span>
              <span class="total">{kg(load.onMe.weight)}</span>
            </header>
            <div class="lists">
              <div
                class="drop"
                class:over={overCarrier === ON_ME}
                class:ready={drag?.kind === 'gear'}
                ondragover={(e) => allowGear(e) && (overCarrier = ON_ME)}
                ondragleave={() => overCarrier === ON_ME && (overCarrier = null)}
                ondrop={(e) => {
                  e.preventDefault();
                  dropGear(ON_ME);
                }}
              >
                {#if load.onMe.items.length}
                  <ul>
                    {#each load.onMe.items as g (g.id)}{@render item(g, ON_ME)}{/each}
                  </ul>
                {:else}
                  <p class="muted hint">{t('bike.onMeDrop')}</p>
                {/if}
              </div>
            </div>
          </article>
          {#each [...load.hardware] as h (h.part)}
            <article class="bag-card rack" class:hot={hot === h.part}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <header
                draggable="true"
                ondragstart={(e) => start(e, { kind: 'part', id: h.part, from: 'bike' })}
                ondragend={end}
                onpointerenter={() => (hot = h.part)}
                onpointerleave={() => (hot = null)}
              >
                <span class="dot" style:background={PART_COLORS[h.part]}></span>
                <strong>{partName(h.part)}</strong>
                <span class="spacer"></span>
                <span class="total">{kg(h.weight)}</span>
                <button type="button" class="x" title={t('bike.takeOff')} aria-label={t('bike.takeOff')} onclick={() => takeOff(h.part)}><Icon d={icons.close} size={12} /></button>
              </header>
              {@render bagSlot(h.part)}
              <p class="muted small">{t(h.part === 'rearRack' ? 'bike.carriesRear' : 'bike.carriesFront')}</p>
            </article>
          {/each}
          {#each carrying as p (p.id)}
            {@const ls = load.carriers.filter((l) => l.part === p.id)}
            <article class="bag-card" class:wide={ls.length > 1} class:hot={hot === p.id} style:--c={PART_COLORS[p.id]}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <header
                draggable="true"
                title={t('bike.cardDragHint')}
                ondragstart={(e) => start(e, { kind: 'part', id: p.id, from: 'bike' })}
                ondragend={end}
                onpointerenter={() => (hot = p.id)}
                onpointerleave={() => (hot = null)}
              >
                <span class="num">{numbers.get(p.id)}</span>
                <strong>{partName(p.id)}</strong>
                {#if p.variants}<span class="muted small">{t(`bike.variant.${variantOf(setup, p.id)}` as StringKey)}</span>{/if}
                <span class="spacer"></span>
                <span class="total">{kg(ls.reduce((n, l) => n + l.total, 0))}</span>
                <button type="button" class="x" title={t('bike.takeOff')} aria-label={t('bike.takeOff')} onclick={() => takeOff(p.id)}><Icon d={icons.close} size={12} /></button>
              </header>
              {@render bagSlot(p.id)}
              <div class="lists" class:pair={ls.length > 1}>
                {#each ls as l (l.carrier)}{@render bagList(l)}{/each}
              </div>
            </article>
          {/each}
        </section>

        <section class="card weights">
          <h2>{t('bike.weights')}</h2>
          {#if load.carriers.length || load.hardware.length}
          <table>
            <thead>
              <tr><th></th><th class="n">{t('bike.colBag')}</th><th class="n">{t('bike.colGear')}</th><th class="n">{t('bike.colTotal')}</th><th class="bar-col"></th></tr>
            </thead>
            <tbody>
              {#each load.carriers as l (l.carrier)}
                <tr class:hot={hot === l.part} onpointerenter={() => (hot = l.part)} onpointerleave={() => (hot = null)}>
                  <td>
                    <span class="num sm" style:background={PART_COLORS[l.part]}>{numbers.get(l.part)}</span>
                    {partName(l.part)}{#if l.side}<span class="muted"> · {sideName(l.carrier)}</span>{/if}
                    {#if l.unweighed}<span class="muted small" title={t('bike.unweighed', { n: l.unweighed })}> *</span>{/if}
                  </td>
                  <td class="n muted" title={l.bag?.name}>{setup.parts[l.part]?.weight === undefined && !l.bag ? '–' : kg(l.own)}</td>
                  <td class="n">{kg(l.contents)}</td>
                  <td class="n"><b>{kg(l.total)}</b></td>
                  <td class="bar-col"><span class="bar" style:width="{(l.total / heaviest) * 100}%" style:background={PART_COLORS[l.part]}></span></td>
                </tr>
              {/each}
              {#each load.hardware as h (h.part)}
                <tr>
                  <td><span class="dot" style:background={PART_COLORS[h.part]}></span> {partName(h.part)}</td>
                  <td class="n muted" title={h.bag?.name}>{setup.parts[h.part]?.weight === undefined && !h.bag ? '–' : kg(h.weight)}</td>
                  <td class="n muted">–</td>
                  <td class="n"><b>{kg(h.weight)}</b></td>
                  <td class="bar-col"><span class="bar" style:width="{(h.weight / heaviest) * 100}%" style:background={PART_COLORS[h.part]}></span></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {/if}

          <div class="split">
            <div class="zones" title={t('bike.zonesHint')}>
              {#each ['rear', 'middle', 'front'] as const as z (z)}
                {#if load.zones[z] > 0}
                  <span class="zone z-{z}" style:flex-grow={load.zones[z]}>{t(`bike.zone.${z}` as StringKey)} {kg(load.zones[z])}</span>
                {/if}
              {/each}
            </div>
            {#if load.sides.L || load.sides.R}
              {@const diff = load.sides.L - load.sides.R}
              <p class="small">
                {t('bike.balance', { l: kg(load.sides.L), r: kg(load.sides.R) })}
                {#if Math.abs(diff) >= 200}<span class="warn-text"> · {t('bike.heavier', { side: t(diff > 0 ? 'bike.side.L' : 'bike.side.R').toLowerCase(), w: kg(Math.abs(diff)) })}</span>{/if}
              </p>
            {/if}
            {#if load.total > 0}
              {@const f = pct(load.wheels.front, load.total)}
              <div class="wheels" title={t('bike.wheelsHint')}>
                <span class="muted small">{t('bike.wheels')}</span>
                <div class="wheel-bar">
                  <span class="w-rear" style:flex-grow={Math.max(1, 100 - f)}>{t('bike.wheelRear', { p: 100 - f, w: kg(load.wheels.rear) })}</span>
                  <span class="w-front" style:flex-grow={Math.max(1, f)}>{t('bike.wheelFront', { p: f, w: kg(load.wheels.front) })}</span>
                </div>
              </div>
            {/if}

            <div class="totals">
              <label class="tile in" title={t('bike.bikeHint')}>
                <span>{t('bike.bike')}</span>
                <span class="kg"><input type="text" inputmode="decimal" placeholder="10.5" value={kgValue(setup.bike)} onchange={(e) => (setup = setBike(setup, kgInput(e.currentTarget.value)))} /> kg</span>
              </label>
              <span class="op">+</span>
              <div class="tile"><span>{t('bike.luggage')}</span><b>{kg(load.total)}</b></div>
              <span class="op">=</span>
              <div class="tile strong" title={t('bike.loadedHint')}><span>{t('bike.loaded')}</span><b>{kg(loadedBike)}</b></div>
            </div>
            <div class="totals">
              <div class="tile"><span>{t('bike.loaded')}</span><b>{kg(loadedBike)}</b></div>
              <span class="op">+</span>
              <div class="tile"><span>{t('bike.onMe')}</span><b>{kg(load.onMe.weight)}</b></div>
              <span class="op">+</span>
              <label class="tile in" title={t('bike.riderHint')}>
                <span>{t('bike.rider')}</span>
                <span class="kg"><input type="text" inputmode="decimal" placeholder="70" value={kgValue(setup.rider)} onchange={(e) => (setup = setRider(setup, kgInput(e.currentTarget.value)))} /> kg</span>
              </label>
              <span class="op">=</span>
              <div class="tile strong" title={t('bike.everythingHint')}><span>{t('bike.everything')}</span><b>{kg(everything)}</b></div>
            </div>
            {#if load.loose.length}<p class="muted small">{t('bike.loose', { w: kg(load.loose.reduce((n, g) => n + gearGrams(g), 0)) })}</p>{/if}
            <p class="muted small">{t('bike.weightNote')}</p>
          </div>
        </section>
    </main>
  </div>
</div>

<style>
  .setup {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    gap: 10px;
    overflow: hidden;
  }

  .setup > header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  h1 {
    margin: 0;
    font-size: 18px;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  h3 {
    margin: 10px 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .local {
    font-size: 12px;
  }

  .spacer {
    flex: 1;
  }

  .sum {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
  }

  .sum span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 290px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 10px;
  }

  aside,
  main {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  aside,
  main {
    overflow: auto;
    padding-bottom: 4px;
  }

  /* On tall screens the bike stays in view while the cards under it scroll. */
  @media (min-height: 860px) {
    .stage {
      position: sticky;
      top: 0;
      z-index: 1;
    }
  }

  .card {
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .small {
    font-size: 12px;
  }

  .muted {
    color: var(--fg-muted);
  }

  p {
    margin: 4px 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
  }

  .parts li {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }

  .parts li:last-child {
    border-bottom: 0;
  }

  .on-bike {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11px;
  }

  .opts {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 2px 24px;
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
    border-radius: 0;
    background: transparent;
    font-size: 12px;
  }

  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .weight {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: 12px;
  }

  .weight input {
    width: 68px;
    padding: 2px 6px;
    text-align: right;
  }

  .gear.over {
    outline: 2px dashed var(--accent);
    outline-offset: -4px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 8px;
  }

  .stats div {
    display: grid;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
  }

  .stats b {
    font-size: 15px;
  }

  .stats span {
    font-size: 11px;
  }

  .progress {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-sunken);
    overflow: hidden;
    margin-bottom: 6px;
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.25s;
  }

  .done {
    color: var(--accent);
  }

  .loose {
    display: grid;
    gap: 4px;
    margin-top: 6px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    font-size: 12px;
    cursor: grab;
  }

  .item:active {
    cursor: grabbing;
  }

  .item.dragging {
    opacity: 0.4;
  }

  .item :global(svg) {
    color: var(--fg-muted);
    flex: none;
  }

  .item .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item .w {
    font-variant-numeric: tabular-nums;
    color: var(--fg-muted);
  }

  .item .w.none {
    font-style: italic;
  }

  .x {
    display: inline-grid;
    place-items: center;
    padding: 2px;
    border: 0;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .x:hover {
    color: var(--danger);
  }

  .stage {
    padding: 10px 18px;
  }

  .stage :global(.bike) {
    max-height: 46vh;
  }

  .warn {
    margin: 4px 0;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--warn);
    font-size: 12px;
  }

  .shelf {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding: 8px;
    min-height: 44px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .shelf.ready {
    border-color: var(--accent);
  }

  .shelf.over {
    background: var(--accent-soft);
  }

  .shelf-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 4px;
  }

  .tile {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    font-size: 12px;
    cursor: grab;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }

  .tile:hover {
    border-color: var(--accent);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px;
    align-items: start;
  }

  .bag-card {
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border-top: 4px solid var(--c, var(--border));
    overflow: hidden;
    transition: box-shadow 0.15s;
  }

  .bag-card.wide {
    grid-column: span 2;
  }

  .bag-card.hot {
    box-shadow: 0 0 0 2px var(--accent), var(--shadow);
  }

  .bag-card header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px 6px;
    cursor: grab;
  }

  .bag-card.rack {
    border-top-color: #868e96;
  }

  .bag-card.rack p {
    padding: 0 10px 8px;
    margin: 0;
  }

  .num {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--c);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }

  .num.sm {
    width: 17px;
    height: 17px;
    font-size: 10px;
    margin-right: 4px;
    vertical-align: middle;
  }

  .total {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bag-card header.static {
    cursor: default;
  }

  .bag-card.me {
    border-top-color: var(--accent);
  }

  .me-icon {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-fg);
  }

  .slot {
    margin: 0 8px 6px;
    padding: 4px 8px;
    min-height: 28px;
    display: flex;
    align-items: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    font-size: 11px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .slot.ready {
    border-color: var(--accent);
  }

  .slot.over {
    background: var(--accent-soft);
  }

  .linked {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
    font-size: 12px;
  }

  .slot .linked {
    flex: 1;
    cursor: grab;
  }

  .linked.dragging {
    opacity: 0.4;
  }

  .linked .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .linked :global(svg) {
    color: var(--accent);
    flex: none;
  }

  .opts .linked {
    margin-left: auto;
    max-width: 170px;
  }

  .lists {
    display: grid;
    gap: 6px;
    padding: 0 8px 8px;
  }

  .lists.pair {
    grid-template-columns: 1fr 1fr;
  }

  .drop {
    min-height: 54px;
    padding: 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    border: 1px dashed transparent;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .drop.ready {
    border-color: var(--border);
  }

  .drop.over {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .drop ul {
    display: grid;
    gap: 3px;
  }

  .side {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--fg-muted);
  }

  .side b {
    color: var(--fg);
  }

  .hint {
    margin: 10px 0;
    text-align: center;
    font-size: 12px;
  }

  .weights table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .weights th {
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-align: left;
    padding: 4px 6px;
  }

  .weights td {
    padding: 5px 6px;
    border-top: 1px solid var(--border);
    white-space: nowrap;
  }

  .weights tr.hot td {
    background: var(--bg-hover);
  }

  .n {
    text-align: right !important;
    font-variant-numeric: tabular-nums;
  }

  .bar-col {
    width: 32%;
  }

  .bar {
    display: block;
    height: 8px;
    border-radius: 4px;
    min-width: 2px;
    transition: width 0.25s;
  }

  .split {
    margin-top: 10px;
  }

  .zones {
    display: flex;
    gap: 3px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
  }

  .zone {
    flex-basis: 0;
    padding: 5px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 60px;
  }

  .z-rear {
    background: #e8590c;
  }

  .z-middle {
    background: #5c677d;
  }

  .z-front {
    background: #1098ad;
  }

  .wheels {
    margin-top: 10px;
  }

  .wheel-bar {
    display: flex;
    gap: 3px;
    margin-top: 3px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: 11px;
    font-weight: 600;
  }

  .wheel-bar span {
    flex-basis: 0;
    padding: 5px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 90px;
    background: var(--bg-sunken);
  }

  .wheel-bar .w-front {
    text-align: right;
  }

  .totals {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
  }

  .tile {
    display: grid;
    gap: 1px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    min-width: 92px;
  }

  .tile > span:first-child {
    font-size: 11px;
    color: var(--fg-muted);
  }

  .tile b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  .tile.strong {
    background: var(--accent-soft);
  }

  .tile.strong b {
    color: var(--accent);
    font-size: 17px;
  }

  .tile.in {
    cursor: text;
    border: 1px dashed var(--border);
  }

  .tile .kg {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-weight: 700;
  }

  .tile input {
    width: 54px;
    padding: 1px 4px;
    font-size: 15px;
    font-weight: 700;
    text-align: right;
  }

  .op {
    color: var(--fg-muted);
    font-weight: 700;
  }

  .warn-text {
    color: var(--warn);
  }


  @media (max-width: 700px) {
    .bag-card.wide {
      grid-column: auto;
    }
  }

  @media (max-width: 860px) {
    .body {
      grid-template-columns: 1fr;
      grid-template-rows: none;
      overflow: auto;
    }

    aside,
    main {
      overflow: visible;
    }

    .stage {
      position: static;
    }
  }
</style>
