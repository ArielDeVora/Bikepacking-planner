<script lang="ts">
  import { LngLatBounds } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import { MODE_ORDER } from '../../config/modes';
  import type { ModuleContext } from '../../core/module';
  import { lineLength } from '../../lib/geo/geo';
  import { Photon } from '../../lib/photon';
  import { compareOrder } from '../../model/order';
  import type { TravelMode } from '../../model/types';
  import { buildImport, type ImportTarget } from './importer';
  import type { ParsedFile, ParsedWaypoint } from './parse';

  let {
    ctx,
    files,
    preview,
  }: {
    ctx: ModuleContext;
    files: ParsedFile[];
    preview: (files: ParsedFile[] | null) => void;
  } = $props();
  const { t, store, ui, commands, selection, map } = $derived(ctx);

  const stages = $derived(store.list('stage').sort(compareOrder));
  const defaultStageId = $derived.by(() => {
    const id = selection.current[0];
    const e = id ? store.get(id) : undefined;
    return e?.type === 'stage' ? e.id : e?.type === 'segment' ? e.stageId : undefined;
  });

  let target = $state<ImportTarget>('auto');
  let mode = $state<TravelMode>(untrack(() => ctx.settings.get('importMode', 'bike')));
  let withWaypoints = $state(true);

  // Places from a Google list without a position, looked up by name on request.
  const LOOKUP_GAP_MS = 1100;
  const unlocated = $derived(files.flatMap((f) => f.unlocated ?? []));
  let found = $state<({ lngLat: [number, number]; label: string } | null | undefined)[]>([]);
  let keep = $state<boolean[]>([]);
  let looking = $state(false);
  let closed = false;

  async function lookUp() {
    looking = true;
    const photon = new Photon();
    const located = files.flatMap((f) => f.waypoints);
    const near = located.length
      ? ([located.reduce((s, w) => s + w.lngLat[0], 0) / located.length, located.reduce((s, w) => s + w.lngLat[1], 0) / located.length] as [number, number])
      : undefined;
    for (let i = 0; i < unlocated.length && !closed; i++) {
      if (found[i] !== undefined) continue;
      try {
        const [r] = await photon.search(unlocated[i]!.name, near, new AbortController().signal);
        found[i] = r ? { lngLat: r.lngLat, label: [r.name, r.detail].filter(Boolean).join(', ') } : null;
        keep[i] = !!r;
      } catch {
        found[i] = null;
      }
      await new Promise((res) => setTimeout(res, LOOKUP_GAP_MS));
    }
    looking = false;
  }

  const foundWaypoints = (): ParsedWaypoint[] =>
    unlocated.flatMap((u, i) => {
      const f = found[i];
      // Plain values: what's stored must not be Svelte state.
      return f && keep[i] ? [{ name: u.name, desc: u.desc, lngLat: [f.lngLat[0], f.lngLat[1]] as [number, number], links: u.url ? [u.url] : [] }] : [];
    });

  const summary = $derived(
    files.map((f) => ({
      file: f,
      tracks: f.tracks.map((tr) => ({
        name: tr.name,
        km: tr.parts.reduce((sum, p) => sum + lineLength(p), 0) / 1000,
        points: tr.parts.reduce((sum, p) => sum + p.length, 0),
        elevation: tr.parts.every((p) => p.every((c) => c.length === 3)),
      })),
    })),
  );
  const trackCount = $derived(files.reduce((n, f) => n + f.tracks.length, 0));
  const waypointCount = $derived(files.reduce((n, f) => n + f.waypoints.length, 0) + found.filter((f, i) => f && keep[i]).length);
  const autoStageName = $derived(
    (defaultStageId && stages.find((s) => s.id === defaultStageId)?.name) || stages.at(-1)?.name || t('tree.stageName', { n: 1 }),
  );

  onMount(() => {
    preview(files);
    const bounds = new LngLatBounds();
    for (const f of files) for (const tr of f.tracks) for (const p of tr.parts) for (const c of p) bounds.extend([c[0], c[1]]);
    for (const f of files) for (const w of f.waypoints) bounds.extend(w.lngLat);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 });
    return () => {
      closed = true;
      preview(null);
    };
  });

  function run() {
    const extra = foundWaypoints();
    const all = extra.length ? [...files, { name: 'lookup', tracks: [], waypoints: extra }] : files;
    const res = buildImport(store, all, {
      tripId: ctx.tripId,
      userId: ctx.user.id,
      target,
      defaultStageId,
      mode,
      waypoints: withWaypoints,
      label: t('cmd.import'),
      stageName: (n) => t('tree.stageName', { n }),
    });
    ctx.settings.set('importMode', mode);
    if (res.command.changes.length) {
      commands.run(res.command);
      const first = res.segmentIds[0];
      if (res.segmentIds.length === 1 && first) selection.set([first]);
      else if (res.stageIds.length === 1) selection.set([res.stageIds[0]!]);
      ui.notify(
        res.poiMatched
          ? t('io.importedMatched', { segments: res.segmentIds.length, pois: res.poiCount, matched: res.poiMatched })
          : t('io.imported', { segments: res.segmentIds.length, pois: res.poiCount }),
      );
    } else if (res.poiMatched) {
      ui.notify(t('io.nothingNew', { matched: res.poiMatched }));
    }
    // Last: closing unmounts this component.
    ui.closeDialog();
  }
</script>

<h2>{t('io.importTitle', { n: files.length })}</h2>

<ul class="files">
  {#each summary as { file, tracks } (file.name)}
    <li>
      <div class="file">{file.name}</div>
      {#if file.error}
        <div class="error">{t('io.parseError', { reason: file.error })}</div>
      {:else if !tracks.length && !file.waypoints.length}
        <div class="muted">{t('io.nothingFound')}</div>
      {/if}
      {#each tracks as tr, i (i)}
        <div class="track">
          <span class="label">{tr.name}</span>
          <span class="muted">{tr.km.toFixed(1)} km · {tr.points} pts{tr.elevation ? '' : ` · ${t('io.noElevation')}`}</span>
        </div>
      {/each}
      {#if file.waypoints.length}
        <div class="muted">{t('io.waypoints', { n: file.waypoints.length })}</div>
      {/if}
    </li>
  {/each}
</ul>

{#if unlocated.length}
  <div class="unlocated">
    <p>{t('io.unlocated', { n: unlocated.length })}</p>
    {#if found.length === 0 && !looking}
      <button type="button" class="btn" onclick={lookUp}>{t('io.lookUp')}</button>
    {/if}
    {#if found.length || looking}
      <ul>
        {#each unlocated as u, i (i)}
          <li>
            {#if found[i]}
              <label><input type="checkbox" bind:checked={keep[i]} /> {u.name} <span class="muted">→ {found[i]!.label}</span></label>
            {:else}
              <span class:muted={found[i] === undefined}>{u.name}</span>
              <span class="muted">{found[i] === null ? t('io.notFound') : ''}</span>
            {/if}
          </li>
        {/each}
      </ul>
      {#if looking}<p class="muted">{t('io.lookingUp')}</p>{/if}
    {/if}
  </div>
{/if}

{#if trackCount}
  <label class="field">
    <span>{t('io.target')}</span>
    <select bind:value={target}>
      <option value="auto">{t('io.targetAuto', { stage: autoStageName })}</option>
      <option value="perFile">{t('io.targetPerFile')}</option>
      {#each stages as st (st.id)}
        <option value={st.id}>{st.name}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span>{t('segment.mode')}</span>
    <select bind:value={mode}>
      {#each MODE_ORDER as m (m)}
        <option value={m}>{t(`mode.${m}`)}</option>
      {/each}
    </select>
  </label>
{/if}
{#if waypointCount}
  <label class="check">
    <input type="checkbox" bind:checked={withWaypoints} />
    {t('io.importWaypoints', { n: waypointCount })}
  </label>
{/if}
<p class="muted note">{t('io.importNote')}</p>

<div class="buttons">
  <button type="button" class="btn" onclick={() => ui.closeDialog()}>{t('io.cancel')}</button>
  <button type="button" class="btn primary" disabled={!trackCount && !(waypointCount && withWaypoints)} onclick={run}>
    {t('io.import')}
  </button>
</div>

<style>
  h2 {
    margin: 0 0 12px;
    font-size: 16px;
  }

  .files {
    max-height: 40vh;
    overflow-y: auto;
    margin: 0 0 14px;
    padding: 0;
    list-style: none;
    font-size: 13px;
  }

  .files li {
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .file {
    font-weight: 600;
  }

  .track {
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error {
    color: var(--danger);
  }

  .unlocated {
    margin-bottom: 12px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }

  .unlocated p {
    margin: 0 0 6px;
  }

  .unlocated ul {
    max-height: 30vh;
    overflow-y: auto;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }

  .unlocated li {
    padding: 2px 0;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .note {
    font-size: 12px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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
</style>
