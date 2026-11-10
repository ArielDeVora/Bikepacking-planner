<script lang="ts">
  import { onMount } from 'svelte';
  import type { ModuleContext } from '../../core/module';
  import type { StringKey } from '../../core/i18n';
  import { restoreChanges, revertChanges, type Commit } from '../../core/history/diff';
  import { icons } from '../../lib/icons';
  import Icon from '../../lib/ui/Icon.svelte';
  import { timeAgo } from '../../lib/time';
  import { lanes, summarize, touching } from './summary';

  let { ctx, focus = null }: { ctx: ModuleContext; focus?: string | null } = $props();
  const { t, store, commands, selection, cloud } = $derived(ctx);
  const scope = $derived(ctx.history.log.scope);
  const changed = $derived(ctx.history.log.changed);
  const members = $derived(ctx.cloud.members);

  const PAGE = 150;
  const ROW_H = 44;
  const LANE_W = 14;

  let commits = $state<Commit[]>([]);
  let loading = $state(true);
  let more = $state(true);
  let error = $state('');
  let selectedId = $state<string | null>(null);
  let person = $state('');
  let onlyFocus = $state(true);
  let confirming = $state(false);

  async function load(reset: boolean) {
    loading = true;
    error = '';
    try {
      ctx.history.recorder.flush();
      const before = reset ? null : (commits.at(-1)?.at ?? null);
      const page = await ctx.history.log.list(before, PAGE);
      commits = reset ? page : [...commits, ...page];
      more = page.length === PAGE;
      if (!selectedId || !commits.some((c) => c.id === selectedId)) selectedId = shown[0]?.id ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load(true);
  });
  // New commits (made here, or by others once sent) while the window is open.
  let lastChange = -1;
  $effect(() => {
    const n = $changed;
    if (lastChange >= 0 && n !== lastChange) void load(true);
    lastChange = n;
  });

  const shown = $derived.by(() => {
    let list = commits;
    if (focus && onlyFocus) list = touching(list, focus);
    if (person) list = list.filter((c) => c.userId === person);
    return list;
  });
  const lane = $derived(lanes(shown));
  const selected = $derived(commits.find((c) => c.id === selectedId) ?? null);
  const people = $derived([...new Set(commits.map((c) => c.userId))]);
  const focusName = $derived.by(() => {
    if (!focus) return '';
    const e = store.getRaw(focus) as { name?: string } | undefined;
    return e?.name || t('history.thisItem');
  });

  function who(userId: string) {
    void $members;
    const mine = cloud.isMine(userId);
    const p = cloud.profileOf(userId);
    return { name: mine ? t('collab.you') : p?.name || t('collab.someone'), color: p?.color ?? (mine ? 'var(--accent)' : 'var(--fg-muted)') };
  }

  const day = (at: number) => new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const full = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  function nameOf(id: string, fallback?: string): string {
    const e = store.getRaw(id) as { name?: string; type?: string } | undefined;
    return fallback || e?.name || t(`history.type.${e?.type ?? 'item'}` as StringKey);
  }

  function items(c: Commit): string {
    const names = [...new Set(c.changes.map((d) => nameOf(d.id, d.name)))];
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  }

  /** Commits newer than this one (in the full list, not filtered). */
  const laterThan = (c: Commit) => commits.slice(0, commits.findIndex((x) => x.id === c.id));
  const laterPeople = $derived(selected ? [...new Set(laterThan(selected).map((c) => who(c.userId).name))] : []);

  function restore(c: Commit) {
    const changes = restoreChanges([...laterThan(c)].reverse(), (id) => store.getRaw(id));
    confirming = false;
    if (!changes.length) return ctx.ui.notify(t('history.nothingToRestore'));
    ctx.history.recorder.markRestore(c.id);
    commands.run({ label: t('history.restoreLabel', { when: full(c.at) }), changes });
    ctx.ui.notify(t('history.restored', { n: changes.length }));
  }

  function revert(c: Commit) {
    const { changes, skipped } = revertChanges(c, (id) => store.getRaw(id));
    if (changes.length) commands.run({ label: t('history.revertLabel', { label: c.label }), changes });
    if (skipped) ctx.ui.notify(t('history.revertSkipped', { n: skipped }), 'warn', 7000);
    else if (!changes.length) ctx.ui.notify(t('history.nothingToRevert'));
  }

  function show(id: string) {
    if (!store.get(id)) return;
    selection.set([id]);
    ctx.ui.closeDialog();
  }

  /** The path of the timeline through one row: from the previous row's lane to the next one's. */
  function path(i: number): string {
    const x = (c: Commit | undefined) => (c ? (lane.get(c.userId) ?? 0) * LANE_W + LANE_W / 2 + 2 : null);
    const me = x(shown[i])!;
    const prev = x(shown[i - 1]);
    const next = x(shown[i + 1]);
    const mid = ROW_H / 2;
    let d = '';
    if (prev !== null) d += `M${prev} 0 C${prev} ${mid * 0.6} ${me} ${mid * 0.4} ${me} ${mid}`;
    if (next !== null) d += ` M${me} ${mid} C${me} ${mid + mid * 0.6} ${next} ${mid + mid * 0.4} ${next} ${ROW_H}`;
    return d;
  }
</script>

<div class="history dialog-sized">
  <header>
    <h2><Icon d={icons.history} size={18} /> {t('history.title')}</h2>
    <div class="filters">
      {#if focus}
        <label class="check"><input type="checkbox" bind:checked={onlyFocus} /> {t('history.onlyItem', { name: focusName })}</label>
      {/if}
      {#if people.length > 1}
        <select bind:value={person} aria-label={t('history.person')}>
          <option value="">{t('history.everyone')}</option>
          {#each people as p (p)}<option value={p}>{who(p).name}</option>{/each}
        </select>
      {/if}
    </div>
  </header>
  <p class="muted small scope">{t(`history.scope.${$scope}` as StringKey)}</p>

  <div class="body">
    <div class="list" role="listbox" aria-label={t('history.title')}>
      {#if error}
        <p class="error">{error}</p>
      {:else if !shown.length && !loading}
        <p class="muted">{t('history.empty')}</p>
      {/if}
      {#each shown as c, i (c.id)}
        {@const w = who(c.userId)}
        {@const x = (lane.get(c.userId) ?? 0) * LANE_W + LANE_W / 2 + 2}
        {@const newDay = i === 0 || day(shown[i - 1]!.at) !== day(c.at)}
        <button
          type="button"
          class="row"
          class:selected={c.id === selectedId}
          class:target={selected?.restoredTo === c.id}
          role="option"
          aria-selected={c.id === selectedId}
          style:height="{ROW_H}px"
          onclick={() => ((selectedId = c.id), (confirming = false))}
        >
          <svg width={lane.size * LANE_W + 4} height={ROW_H} aria-hidden="true">
            {#each [...lane] as [uid, l] (uid)}
              <line x1={l * LANE_W + LANE_W / 2 + 2} x2={l * LANE_W + LANE_W / 2 + 2} y1="0" y2={ROW_H} stroke={who(uid).color} stroke-opacity="0.18" stroke-width="2" />
            {/each}
            <path d={path(i)} fill="none" stroke="var(--fg-muted)" stroke-opacity="0.6" stroke-width="1.5" />
            {#if c.kind === 'restore'}
              <rect x={x - 5} y={ROW_H / 2 - 5} width="10" height="10" transform="rotate(45 {x} {ROW_H / 2})" fill={w.color} stroke="var(--bg)" stroke-width="1.5" />
            {:else if c.kind === 'undo' || c.kind === 'redo'}
              <circle cx={x} cy={ROW_H / 2} r="4.5" fill="var(--bg)" stroke={w.color} stroke-width="2" />
            {:else}
              <circle cx={x} cy={ROW_H / 2} r="5" fill={w.color} stroke="var(--bg)" stroke-width="1.5" />
            {/if}
          </svg>
          <span class="text">
            <span class="label">{cap(c.label)}</span>
            <span class="items muted">{items(c)}</span>
          </span>
          <span class="meta">
            {#if newDay}<span class="day">{day(c.at)}</span>{/if}
            <span class="muted"><span class="who" style:color={w.color}>{w.name}</span> · {time(c.at)}</span>
          </span>
        </button>
      {/each}
      {#if loading}
        <p class="muted small">{t('history.loading')}</p>
      {:else if more && commits.length}
        <button type="button" class="link more" onclick={() => load(false)}>{t('history.older')}</button>
      {/if}
    </div>

    <aside class="details">
      {#if selected}
        {@const w = who(selected.userId)}
        <h3>{cap(selected.label)}</h3>
        <p class="muted small">
          <span class="who" style:color={w.color}>{w.name}</span> · {full(selected.at)} · {timeAgo(t, selected.at)}
        </p>
        {#if selected.restoredTo}
          {@const target = commits.find((c) => c.id === selected.restoredTo)}
          <p class="small">
            {t('history.restoredTo')}
            {#if target}<button type="button" class="link" onclick={() => (selectedId = target.id)}>{cap(target.label)} · {full(target.at)}</button>{/if}
          </p>
        {/if}
        <ul class="changes">
          {#each selected.changes as d (d.id)}
            {@const s = summarize(d)}
            <li>
              <button type="button" class="link item" disabled={!store.get(d.id)} onclick={() => show(d.id)}>{nameOf(d.id, d.name)}</button>
              <span class="muted">
                {t(`history.verb.${s.verb}` as StringKey)}{#if s.fields.length}: {s.fields.map((f) => t(`history.field.${f}` as StringKey)).join(', ')}{/if}
              </span>
            </li>
          {/each}
        </ul>

        <div class="actions">
          {#if confirming}
            <p class="small confirm">
              {laterThan(selected).length
                ? t('history.confirmRestore', { n: laterThan(selected).length, people: laterPeople.join(', ') })
                : t('history.latest')}
            </p>
            <button type="button" class="btn primary" disabled={!laterThan(selected).length} onclick={() => restore(selected)}>{t('history.restore')}</button>
            <button type="button" class="btn" onclick={() => (confirming = false)}>{t('history.cancel')}</button>
          {:else}
            <button type="button" class="btn primary" title={t('history.restoreHint')} onclick={() => (confirming = true)}>{t('history.restoreHere')}</button>
            <button type="button" class="btn" title={t('history.revertHint')} onclick={() => revert(selected)}>{t('history.revert')}</button>
          {/if}
        </div>
      {:else}
        <p class="muted">{t('history.pick')}</p>
      {/if}
    </aside>
  </div>

  <div class="buttons">
    <button type="button" class="btn" onclick={() => ctx.ui.closeDialog()}>{t('card.close')}</button>
  </div>
</div>

<style>
  .history {
    width: min(1000px, calc(100vw - 72px));
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 16px;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .scope {
    margin: 4px 0 10px;
  }

  .small {
    font-size: 12px;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 16px;
    height: min(60vh, 560px);
  }

  .list {
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 10px 0 4px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.selected {
    background: var(--accent-soft);
  }

  .row.target {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  svg {
    flex: none;
  }

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .label,
  .items {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .label {
    font-size: 13px;
  }

  .items {
    font-size: 12px;
  }

  .meta {
    display: grid;
    flex: none;
    justify-items: end;
    font-size: 11px;
  }

  .day {
    font-weight: 600;
  }

  .who {
    font-weight: 600;
  }

  .details {
    overflow-y: auto;
  }

  h3 {
    margin: 0 0 4px;
    font-size: 15px;
  }

  .changes {
    margin: 10px 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.6;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .confirm {
    flex-basis: 100%;
    margin: 0 0 4px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .link:disabled {
    color: var(--fg);
    cursor: default;
  }

  .more {
    display: block;
    margin: 10px auto;
    font-size: 13px;
  }

  .error {
    padding: 10px;
    color: var(--danger);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }

  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 720px) {
    .body {
      grid-template-columns: 1fr;
      height: auto;
    }

    .list {
      max-height: 45vh;
    }
  }
</style>
