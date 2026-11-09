<script lang="ts">
  import { MODE_ORDER, MODES } from '../../config/modes';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Segment, TravelMode } from '../../model/types';
  import { changeMode, retryChange, setProfile, setSnap } from './actions';
  import { segmentColor } from './render';
  import type { RoutingProvider } from './routing/provider';
  import type { Reconciler } from './routing/reconcile';

  let {
    id,
    ctx,
    provider,
    reconciler,
    onModeChosen,
  }: {
    id: string;
    ctx: ModuleContext;
    provider: RoutingProvider;
    reconciler: Reconciler;
    onModeChosen: (mode: TravelMode) => void;
  } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const seg = $derived.by(() => {
    void $store;
    return store.get(id, 'segment');
  });
  const color = $derived.by(() => {
    void $store;
    return seg ? segmentColor(seg, store.get(seg.stageId, 'stage')) : '';
  });
  const pending = $derived(seg?.legs.filter((l) => l.status === 'pending').length ?? 0);
  const failed = $derived(seg?.legs.filter((l) => l.status === 'failed').length ?? 0);
  const profiles = $derived(seg ? (provider.profiles[seg.mode] ?? []) : []);

  type TextField = 'name' | 'notes' | 'plannedDate' | 'color';

  function edit(field: TextField, value: string | undefined) {
    const patch: Partial<Segment> = { [field]: field === 'name' || field === 'notes' ? (value ?? '') : value || undefined };
    commands.run({
      label: t('cmd.editSegment'),
      changes: [edits.update<Segment>(store, id, patch)],
      mergeKey: `segment:${id}:${field}`,
    });
  }

  function pickMode(mode: TravelMode) {
    if (!seg) return;
    const cmd = changeMode(store, seg, mode, reconciler.profileOf, t('cmd.changeMode'));
    if (cmd) commands.run(cmd);
    onModeChosen(mode);
  }

  function toggleSnap(snap: boolean) {
    const cmd = seg && setSnap(store, seg, snap, t('cmd.toggleSnap'));
    if (cmd) commands.run(cmd);
  }

  function pickProfile(profile: string) {
    if (!seg) return;
    const value = profile === profiles[0]?.id ? undefined : profile;
    commands.run(setProfile(store, seg, value, t('cmd.changeProfile')));
  }

  const km = (m: number) => (m / 1000).toFixed(m < 10_000 ? 2 : 1);
</script>

{#if seg}
  <label class="field">
    <span>{t('segment.name')}</span>
    <input type="text" value={seg.name} oninput={(e) => edit('name', e.currentTarget.value)} onblur={() => commands.seal()} />
  </label>

  <div class="field">
    <span>{t('segment.mode')}</span>
    <div class="modes" role="radiogroup" aria-label={t('segment.mode')}>
      {#each MODE_ORDER as mode (mode)}
        <IconButton icon={icons[mode]} label={t(`mode.${mode}`)} active={seg.mode === mode} onclick={() => pickMode(mode)} />
      {/each}
    </div>
  </div>

  {#if seg.geomType === 'imported'}
    <p class="hint muted">{t('segment.importedHint')}</p>
  {:else if MODES[seg.mode].snappable && profiles.length}
    <label class="check">
      <input type="checkbox" checked={seg.geomType === 'routed'} onchange={(e) => toggleSnap(e.currentTarget.checked)} />
      {seg.mode === 'train' ? t('segment.snapRail') : t('segment.snap')}
    </label>
    {#if seg.geomType === 'routed' && profiles.length > 1}
      <label class="field">
        <span>{t('segment.profile')}</span>
        <select value={reconciler.profileOf(seg)} onchange={(e) => pickProfile(e.currentTarget.value)}>
          {#each profiles as p (p.id)}
            <option value={p.id}>{p.label}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/if}

  <dl class="stats">
    <div><dt>{t('segment.distance')}</dt><dd>{km(seg.stats.lengthM)} km</dd></div>
    {#if seg.stats.ascentM || seg.stats.descentM}
      <div><dt>{t('segment.ascent')}</dt><dd>{seg.stats.ascentM} m</dd></div>
      <div><dt>{t('segment.descent')}</dt><dd>{seg.stats.descentM} m</dd></div>
    {/if}
  </dl>

  {#if pending}
    <p class="status muted">{t('segment.pending', { n: pending })}</p>
  {/if}
  {#if failed}
    <p class="status warn">
      {t('segment.failed', { n: failed })}
      <button type="button" class="link" onclick={() => commands.patch([retryChange(store, seg)])}>{t('segment.retry')}</button>
    </p>
  {/if}

  <div class="row">
    <label class="field">
      <span>{t('segment.plannedDate')}</span>
      <input type="date" value={seg.plannedDate ?? ''} onchange={(e) => edit('plannedDate', e.currentTarget.value)} />
    </label>
    {#if MODES[seg.mode].stageColor}
      <div class="field color">
        <span>{t('segment.color')}</span>
        <div class="color-row">
          <input type="color" value={color} aria-label={t('segment.color')} onchange={(e) => edit('color', e.currentTarget.value)} />
          {#if seg.color}
            <IconButton icon={icons.close} label={t('segment.colorReset')} size={14} onclick={() => edit('color', undefined)} />
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <label class="field">
    <span>{t('segment.notes')}</span>
    <textarea value={seg.notes} oninput={(e) => edit('notes', e.currentTarget.value)} onblur={() => commands.seal()}></textarea>
  </label>

  {#if seg.geomType !== 'imported'}
    <p class="hint muted">{t('segment.hint')}</p>
  {/if}

  <footer>
    {#if seg.geomType === 'routed'}
      <span class="muted">{t('segment.routedBy', { provider: provider.label })}</span>
    {:else}
      <span></span>
    {/if}
    <button
      type="button"
      class="danger"
      onclick={() => commands.run({ label: t('cmd.deleteSegment'), changes: [edits.remove(store, id)] })}
    >
      {t('segment.delete')}
    </button>
  </footer>
{/if}

<style>
  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    cursor: pointer;
  }

  .stats {
    display: flex;
    gap: 18px;
    margin: 4px 0 12px;
  }

  .stats dt {
    font-size: 12px;
    color: var(--fg-muted);
  }

  .stats dd {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .status {
    margin: 0 0 10px;
    font-size: 13px;
  }

  .warn {
    color: var(--warn);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .color input {
    width: 44px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .hint {
    font-size: 12px;
    line-height: 1.4;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }

  .danger {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    cursor: pointer;
  }

  .danger:hover {
    background: var(--bg-hover);
  }
</style>
