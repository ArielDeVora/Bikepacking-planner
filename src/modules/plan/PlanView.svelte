<script lang="ts">
  import { LngLatBounds } from 'maplibre-gl';
  import { untrack } from 'svelte';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { loadCountries, type CountryIndex } from '../../lib/countries';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { climateSampler, type ClimateValues } from '../climate/data';
  import Calendar, { type CalRest, type CalRow } from './Calendar.svelte';
  import {
    addRestPeriodCommand,
    editRestPeriodCommand,
    planSchedule,
    planSegments,
    planSettings,
    planSources,
    planStages,
    restPeriods,
    setScheduleCommand,
  } from './plan';
  import { planRows, RouteLine } from './rows';
  import { fromDayNumber, toDayNumber } from './schedule';
  import { nearestRegion, seasonAt, seasonWeek, type Rating } from './seasons';
  import type { ScheduleSettings, Segment } from '../../model/types';

  let { ctx, close }: { ctx: ModuleContext; close: () => void } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  // What's planned: a route, or the stages outside routes. Remembered in this browser.
  const sources = $derived.by(() => {
    void $store;
    return planSources(store, t);
  });
  let chosen = $state(untrack(() => ctx.settings.get<string | null>('source', null)));
  const source = $derived(sources.find((s) => s.id === chosen)?.id ?? sources[0]?.id ?? null);
  function choose(id: string) {
    chosen = id;
    ctx.settings.set('source', id);
  }

  const settings = $derived.by(() => {
    void $store;
    return source ? planSettings(store, source) : null;
  });
  const segments = $derived.by(() => {
    void $store;
    return source ? planSegments(store, source) : [];
  });
  const schedule = $derived.by(() => {
    void $store;
    return source ? planSchedule(store, source) : null;
  });
  const periods = $derived.by(() => {
    void $store;
    return source ? restPeriods(store, source) : [];
  });
  const line = $derived(new RouteLine(segments));

  // Country outlines and climate averages, loaded once.
  let countries = $state<CountryIndex | null>(null);
  let sample = $state<((lng: number, lat: number, day: number) => ClimateValues | null) | null>(null);
  let loadFailed = $state(false);
  $effect(() => {
    loadCountries()
      .then((c) => (countries = c))
      .catch(() => (loadFailed = true));
    climateSampler()
      .then((s) => (sample = s))
      .catch(() => (loadFailed = true));
  });

  const rows = $derived(planRows(segments, line, countries));

  // The calendar: March 2027 to April 2028, stretched to fit the trip if it starts earlier or ends later.
  const range = $derived.by(() => {
    const monthStart = (n: number) => {
      const d = new Date(n * 86_400_000);
      return toDayNumber(`${d.toISOString().slice(0, 7)}-01`);
    };
    const monthEnd = (n: number) => {
      const d = new Date(n * 86_400_000);
      return toDayNumber(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
    };
    let from = toDayNumber('2027-03-01');
    let to = toDayNumber('2028-04-30');
    if (schedule && schedule.days.length) {
      from = Math.min(from, monthStart(toDayNumber(schedule.days[0]!.date)));
      to = Math.max(to, monthEnd(toDayNumber(schedule.days.at(-1)!.date)));
    }
    return { first: from, count: to - from + 1 };
  });
  const colOf = (iso: string) => toDayNumber(iso) - range.first;
  const dateAt = (col: number) => new Date((range.first + col) * 86_400_000);

  // Season ratings for a place, one per quarter-month (as in the team's table).
  function weeklyRatings(p: [number, number] | null): (Rating | null)[] {
    if (!p || !sample) return Array(48).fill(null);
    const region = nearestRegion(p);
    return Array.from({ length: 48 }, (_, w) => {
      const m = (Math.floor(w / 4) + 2) % 12;
      const days = new Date(Date.UTC(2027, m + 1, 0)).getUTCDate();
      const date = new Date(Date.UTC(2027, m, Math.min(days, 1 + Math.floor(((w % 4) + 0.5) * (days / 4)))));
      return seasonAt(p, date, sample!, region)?.rating ?? null;
    });
  }
  const columnWeeks = $derived(Array.from({ length: range.count }, (_, col) => seasonWeek(dateAt(col))));
  const heatFor = (weekly: (Rating | null)[]) => columnWeeks.map((w) => weekly[w] ?? null);

  // Where we are at the end of each day of the schedule, and in which row.
  const daysByCol = $derived.by(() => {
    const map = new Map<number, NonNullable<typeof schedule>['days'][number]>();
    for (const d of schedule?.days ?? []) map.set(colOf(d.date), d);
    return map;
  });

  const calRows = $derived.by((): CalRow[] => {
    if (!schedule || !source) return [];
    void $store;
    const stages = planStages(store, source);
    const stageColor = new Map(stages.map((s) => [s.id, s.color]));
    const rowsBySegment = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = rowsBySegment.get(r.segmentId);
      if (list) list.push(r);
      else rowsBySegment.set(r.segmentId, [r]);
    }
    // Visits: which columns each row is ridden, travelled or rested in.
    const visits = new Map<string, Map<number, 'move' | 'transport' | 'rest'>>();
    const mark = (key: string, col: number, kind: 'move' | 'transport' | 'rest') => {
      let m = visits.get(key);
      if (!m) visits.set(key, (m = new Map()));
      if (!m.has(col) || kind !== 'rest') m.set(col, kind);
    };
    // Rest and waiting days show in the row we're in; none before we've set off.
    let current: string | null = null;
    let lastPoint: [number, number] | null = null;
    const strip: (Rating | null)[] = Array(range.count).fill(null);
    for (const day of schedule.days) {
      const col = colOf(day.date);
      for (const part of day.parts) {
        for (const r of rowsBySegment.get(part.segmentId) ?? []) {
          const touches = part.toKm > r.fromKm + 1e-6 && part.fromKm < r.toKm - 1e-6;
          const point = part.fromKm === part.toKm && part.fromKm >= r.fromKm && part.fromKm <= r.toKm;
          if (touches || point) {
            mark(r.key, col, day.kind === 'transport' ? 'transport' : 'move');
            if (part.toKm <= r.toKm + 1e-6) current = r.key;
          }
        }
      }
      if (!day.parts.length && current) mark(current, col, 'rest');
      const end = day.parts.at(-1)?.toKm;
      const p = end !== undefined ? line.pointAt(end) : null;
      if (sample && (p ?? lastPoint)) {
        const at = p ?? lastPoint!;
        strip[col] = seasonAt(at, dateAt(col), sample)?.rating ?? null;
      }
      if (p) lastPoint = p;
    }

    const out: CalRow[] = [{ key: '__strip', kind: 'strip', label: t('plan.onTheDay'), heat: strip }];
    for (const stage of stages) {
      out.push({ key: `stage:${stage.id}`, kind: 'stage', label: stage.name, color: stageColor.get(stage.id) });
      for (const seg of segments.filter((s) => s.stageId === stage.id)) {
        const span = schedule.spans.get(seg.id);
        (rowsBySegment.get(seg.id) ?? []).forEach((r, i) => {
          const runs: NonNullable<CalRow['bars']> = [];
          const cols = [...(visits.get(r.key)?.entries() ?? [])].sort((a, b) => a[0] - b[0]);
          for (const [col, kind] of cols) {
            const last = runs.at(-1);
            if (last && last.kind === kind && last.to === col - 1) last.to = col;
            else runs.push({ from: col, to: col, kind });
          }
          const pins =
            i === 0 && span?.fixed
              ? [{ col: colOf(span.fixed), late: !!span.late, title: t('plan.fixed', { date: span.fixed }) }]
              : [];
          out.push({
            key: r.key,
            kind: 'row',
            label: r.country && (rowsBySegment.get(seg.id)?.length ?? 0) > 1 ? `${r.name} · ${r.country.name}` : r.name,
            flag: r.country ? flag(r.country.code) : undefined,
            country: r.country ?? undefined,
            sub: `${Math.round(r.toKm - r.fromKm)} km`,
            segmentId: seg.id,
            heat: heatFor(weeklyRatings(r.mid)),
            bars: runs,
            pins,
          });
        });
      }
    }
    return out;
  });
  function flag(code: string): string {
    return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';
  }

  // Countries in the order we reach them: when we're there and for how long (visas!).
  const VISA_DAYS = 30;
  const stays = $derived.by(() => {
    const byCode = new Map<string, { code: string; name: string; flag: string; cols: Set<number> }>();
    for (const row of calRows) {
      if (!row.country || !row.bars?.length) continue;
      let stay = byCode.get(row.country.code);
      if (!stay) byCode.set(row.country.code, (stay = { ...row.country, flag: row.flag ?? '', cols: new Set() }));
      for (const bar of row.bars) for (let c = bar.from; c <= bar.to; c++) stay.cols.add(c);
    }
    return [...byCode.values()]
      .map((s) => {
        const cols = [...s.cols].sort((a, b) => a - b);
        return { ...s, from: fromDayNumber(range.first + cols[0]!), to: fromDayNumber(range.first + cols.at(-1)!), days: cols.at(-1)! - cols[0]! + 1 };
      })
      .sort((a, b) => a.from.localeCompare(b.from));
  });
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const rests = $derived(periods.map((p): CalRest => ({ id: p.id, from: colOf(p.from), to: colOf(p.to), name: p.name })));

  // Summary and warnings.
  const summary = $derived.by(() => {
    if (!schedule) return null;
    const count = (k: string) => schedule.days.filter((d) => d.kind === k).length;
    return {
      days: schedule.days.length,
      ride: count('ride'),
      transport: count('transport'),
      rest: count('rest'),
      wait: count('wait'),
      km: Math.round(schedule.totalKm),
      end: schedule.days.at(-1)?.date,
    };
  });
  const late = $derived.by(() => {
    if (!schedule) return [];
    return [...schedule.spans.values()]
      .filter((s) => s.late)
      .map((s) => ({ name: store.get(s.segmentId, 'segment')?.name ?? '', n: s.late!, date: s.fixed! }));
  });

  const fmtDate = (iso: string | undefined) =>
    iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

  /** Tooltip lines for a day in a row. */
  function describe(col: number, row: CalRow | null): string[] {
    const date = dateAt(col);
    const iso = fromDayNumber(range.first + col);
    const lines = [fmtDate(iso)];
    const day = daysByCol.get(col);
    if (day) {
      const kind = t(`plan.kind.${day.kind}`);
      lines.push(`${t('plan.dayN', { n: day.index + 1 })} · ${day.rest ? `${kind}: ${day.rest}` : kind}`);
      const from = day.parts[0]?.fromKm;
      const to = day.parts.at(-1)?.toKm;
      if (from !== undefined && to !== undefined) lines.push(t('plan.kmRange', { from: Math.round(from), to: Math.round(to) }));
    }
    if (row && row.kind === 'row') {
      lines.push(row.label);
      const r = rows.find((x) => x.key === row.key);
      if (r?.mid && sample) {
        const s = seasonAt(r.mid, date, sample);
        if (s) {
          lines.push(`${t(`plan.rating.${s.rating}`)} ${s.region ? t('plan.fromTeam', { region: s.region.name, city: s.region.city }) : t('plan.fromClimate')}`);
          if (s.climate) lines.push(t('plan.climate', { tmax: Math.round(s.climate.tmax), tmin: Math.round(s.climate.tmin), ppt: Math.round(s.climate.ppt) }));
        }
      }
    }
    return lines;
  }

  // Edits
  function setSetting<K extends keyof ScheduleSettings>(key: K, value: ScheduleSettings[K]) {
    if (!source) return;
    const cmd = setScheduleCommand(store, source, { [key]: value } as Partial<ScheduleSettings>, t('cmd.editSchedule'));
    if (cmd) commands.run(cmd);
  }
  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  function addRest(fromCol: number, toCol: number) {
    if (!source) return;
    const { command, id } = addRestPeriodCommand(store, {
      tripId: ctx.tripId,
      source,
      from: fromDayNumber(range.first + fromCol),
      to: fromDayNumber(range.first + toCol),
      name: t('plan.restName'),
      label: t('cmd.addRest'),
    });
    commands.run(command);
    focusRest = id;
  }
  function editRest(id: string, patch: { from?: string; to?: string; name?: string }) {
    const cmd = editRestPeriodCommand(store, id, patch, t('cmd.editRest'));
    if (cmd) commands.run(cmd);
  }
  function deleteRest(id: string) {
    commands.run({ label: t('cmd.deleteRest'), changes: [edits.remove(store, id)] });
  }
  let focusRest = $state<string | null>(null);

  // The segment picked in the calendar, edited in the side panel.
  let picked = $state<string | null>(null);
  const pickedSeg = $derived.by(() => {
    void $store;
    return picked ? store.get(picked, 'segment') : undefined;
  });
  const pickedSpan = $derived(picked && schedule ? schedule.spans.get(picked) : undefined);
  const spanDates = $derived.by(() => {
    if (!pickedSpan || !schedule) return null;
    const startDay = toDayNumber(schedule.start);
    return { from: fromDayNumber(startDay + pickedSpan.first), to: fromDayNumber(startDay + pickedSpan.last), days: pickedSpan.last - pickedSpan.first + 1 };
  });
  function editSegment(patch: { plannedDate?: string; planKmPerDay?: number; planDays?: number }, field: string) {
    if (!pickedSeg) return;
    commands.run({ label: t('cmd.editSchedule'), changes: [edits.update<Segment>(store, pickedSeg.id, patch)], mergeKey: `plan:${pickedSeg.id}:${field}` });
  }
  const optional = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)) || undefined);

  function showOnMap(row: CalRow | { segmentId?: string }) {
    const seg = row.segmentId ? store.get(row.segmentId, 'segment') : undefined;
    if (!seg) return;
    ctx.selection.set([seg.id]);
    const bounds = new LngLatBounds();
    for (const a of seg.anchors) bounds.extend(a.lngLat);
    close();
    if (!bounds.isEmpty()) requestAnimationFrame(() => ctx.map.fitBounds(bounds, { padding: 80, maxZoom: 12 }));
  }

  let width = $state(untrack(() => ctx.settings.get('dayWidth', 12)));
  function setWidth(w: number) {
    width = w;
    ctx.settings.set('dayWidth', w);
  }
</script>

<div class="plan">
  <header>
    <button type="button" class="back" onclick={close}><Icon d={icons.back} size={16} /> {t('plan.back')}</button>
    <h1>{t('plan.title')}</h1>
    {#if sources.length}
      <label>
        <span>{t('plan.source')}</span>
        <select value={source} onchange={(e) => choose(e.currentTarget.value)}>
          {#each sources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if settings}
      <label>
        <span>{t('plan.start')}</span>
        <input type="date" value={settings.startDate} onchange={(e) => e.currentTarget.value && setSetting('startDate', e.currentTarget.value)} />
      </label>
      <label>
        <span>{t('plan.kmPerDay')}</span>
        <input type="number" min="10" max="300" step="5" value={settings.kmPerDay} onchange={(e) => setSetting('kmPerDay', num(e.currentTarget.value, 10))} />
      </label>
      <label>
        <span>{t('plan.walkKmPerDay')}</span>
        <input type="number" min="5" max="60" step="1" value={settings.walkKmPerDay} onchange={(e) => setSetting('walkKmPerDay', num(e.currentTarget.value, 5))} />
      </label>
      <label title={t('plan.restEveryUnit')}>
        <span>{t('plan.restEvery')}</span>
        <input type="number" min="0" max="30" step="1" value={settings.restEvery} onchange={(e) => setSetting('restEvery', num(e.currentTarget.value))} />
      </label>
      <label>
        <span>{t('plan.climbKm')}</span>
        <input type="number" min="0" max="5" step="0.5" value={settings.climbKm} onchange={(e) => setSetting('climbKm', num(e.currentTarget.value))} />
      </label>
    {/if}
    <span class="spacer"></span>
    <label>
      <span>{t('plan.zoom')}</span>
      <input type="range" min="4" max="28" step="1" value={width} oninput={(e) => setWidth(Number(e.currentTarget.value))} />
    </label>
  </header>

  {#if !segments.length}
    <p class="empty">{t('plan.noSegments')}</p>
  {:else}
    <div class="main">
      <div class="calendar">
        <Calendar
          first={range.first}
          count={range.count}
          rows={calRows}
          {rests}
          {width}
          {describe}
          onAddRest={addRest}
          selected={picked}
          onRowClick={(row) => (picked = row.segmentId ?? null)}
          onRestClick={(id) => (focusRest = id)}
        />
      </div>

      <aside>
        {#if summary}
          <section class="summary">
            <strong>{t('plan.days', { n: summary.days })}</strong>
            <span>{t('plan.riding', { n: summary.ride })} · {t('plan.resting', { n: summary.rest })}{summary.wait ? ` · ${t('plan.waiting', { n: summary.wait })}` : ''}</span>
            <span>{summary.km.toLocaleString()} km · {t('plan.ends', { date: fmtDate(summary.end) })}</span>
          </section>
        {/if}
        {#if !sample || !countries}
          <p class="muted small">{loadFailed ? '⚠' : ''} {t('plan.loading')}</p>
        {/if}
        {#each late as l (l.name + l.date)}
          <p class="late">{t('plan.late', { name: l.name, n: l.n, date: fmtDate(l.date) })}</p>
        {/each}

        {#if pickedSeg}
          <section class="picked">
            <h2>{t('plan.segment')}</h2>
            <strong>{pickedSeg.name}</strong>
            {#if spanDates}
              <span class="muted small">{fmtDate(spanDates.from)} → {fmtDate(spanDates.to)} · {t('plan.days', { n: spanDates.days })}</span>
            {/if}
            <label class="field">
              <span>{t('plan.fixedDate')}</span>
              <input type="date" value={pickedSeg.plannedDate ?? ''} onchange={(e) => editSegment({ plannedDate: e.currentTarget.value || undefined }, 'date')} />
            </label>
            <div class="pair">
              <label class="field">
                <span>{t('plan.ownKmPerDay')}</span>
                <input
                  type="number"
                  min="5"
                  step="5"
                  placeholder={String(pickedSeg.mode === 'walk' ? settings?.walkKmPerDay : settings?.kmPerDay)}
                  value={pickedSeg.planKmPerDay ?? ''}
                  onchange={(e) => editSegment({ planKmPerDay: optional(e.currentTarget.value) }, 'pace')}
                />
              </label>
              <label class="field">
                <span>{t('plan.ownDays')}</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  placeholder={t('plan.auto')}
                  value={pickedSeg.planDays ?? ''}
                  onchange={(e) => editSegment({ planDays: optional(e.currentTarget.value) }, 'days')}
                />
              </label>
            </div>
            <p class="muted small">{t('plan.paceHint')}</p>
            <button type="button" class="link" onclick={() => showOnMap({ segmentId: pickedSeg.id })}>{t('plan.showOnMap')}</button>
          </section>
        {/if}

        {#if stays.length}
          <section>
            <h2>{t('plan.countries')}</h2>
            <ul class="stays">
              {#each stays as s (s.code)}
                <li class:long={s.days > VISA_DAYS} title={s.days > VISA_DAYS ? t('plan.visaWarning', { n: VISA_DAYS }) : undefined}>
                  <span class="flag">{s.flag}</span>
                  <span class="cname">{s.name}</span>
                  <span class="muted when">{shortDate(s.from)} → {shortDate(s.to)}</span>
                  <span class="ndays">{t('plan.days', { n: s.days })}{s.days > VISA_DAYS ? ' ⚠' : ''}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <section>
          <h2>{t('plan.restPeriods')}</h2>
          <p class="muted small">{t('plan.restHint')}</p>
          {#each periods as p (p.id)}
            <div class="rest" class:focus={focusRest === p.id}>
              <div class="top">
                <input class="name" type="text" value={p.name} oninput={(e) => editRest(p.id, { name: e.currentTarget.value })} onblur={() => commands.seal()} />
                <button type="button" class="del" title={t('plan.delete')} aria-label={t('plan.delete')} onclick={() => deleteRest(p.id)}>
                  <Icon d={icons.trash} size={14} />
                </button>
              </div>
              <input type="date" value={p.from} onchange={(e) => e.currentTarget.value && editRest(p.id, { from: e.currentTarget.value })} />
              <input type="date" value={p.to} onchange={(e) => e.currentTarget.value && editRest(p.id, { to: e.currentTarget.value })} />
            </div>
          {:else}
            <p class="muted small">{t('plan.noRest')}</p>
          {/each}
        </section>

        <section class="legend">
          <div><span class="sw good"></span>{t('plan.rating.2')}</div>
          <div><span class="sw ok"></span>{t('plan.rating.1')}</div>
          <div><span class="sw bad"></span>{t('plan.rating.0')}</div>
          <p class="muted small">{t('plan.legend')}</p>
        </section>
      </aside>
    </div>
  {/if}
</div>

<style>
  .plan {
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

  label input,
  label select {
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
  }

  label input[type='number'] {
    width: 80px;
  }

  label input[type='range'] {
    padding: 0;
    border: 0;
    accent-color: var(--accent);
  }

  .spacer {
    flex: 1;
  }

  .empty {
    margin: 40px auto;
    color: var(--fg-muted);
  }

  .main {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 10px;
  }

  .calendar {
    flex: 1;
    min-width: 0;
  }

  aside {
    flex: none;
    width: 280px;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  section + section {
    margin-top: 16px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .summary {
    display: grid;
    gap: 2px;
    font-size: 13px;
  }

  .summary strong {
    font-size: 18px;
  }

  .small {
    font-size: 12px;
  }

  .late {
    margin: 8px 0 0;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: rgb(224 49 49 / 0.1);
    color: var(--danger);
    font-size: 12px;
  }

  .rest {
    display: grid;
    gap: 4px;
    margin-top: 8px;
    padding: 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
  }

  .rest.focus {
    outline: 2px solid #4c6ef5;
  }

  .rest input {
    min-width: 0;
    padding: 3px 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
  }

  .rest .name {
    font-weight: 600;
  }

  .rest .top {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .rest .top .name {
    flex: 1;
  }

  .del {
    display: grid;
    place-items: center;
    padding: 3px;
    border: 0;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .del:hover {
    color: var(--danger);
  }

  .stays {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
  }

  .stays li {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    grid-template-areas: 'flag name days' 'flag when when';
    column-gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }

  .stays .flag {
    grid-area: flag;
  }

  .stays .cname {
    grid-area: name;
    font-weight: 600;
  }

  .stays .when {
    grid-area: when;
  }

  .stays .ndays {
    grid-area: days;
    font-variant-numeric: tabular-nums;
  }

  .stays li.long .ndays {
    color: var(--danger);
    font-weight: 700;
  }

  .picked {
    display: grid;
    gap: 6px;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
  }

  .field {
    display: grid;
    gap: 2px;
    font-size: 11px;
    color: var(--fg-muted);
  }

  .field input {
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .legend div {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .sw {
    width: 14px;
    height: 10px;
    border-radius: 2px;
  }

  .sw.good {
    background: #93c47d;
  }

  .sw.ok {
    background: #f6b26b;
  }

  .sw.bad {
    background: #e06666;
  }
</style>
