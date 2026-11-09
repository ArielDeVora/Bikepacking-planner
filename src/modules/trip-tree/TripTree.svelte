<script lang="ts">
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Trip } from '../../model/types';
  import { addStage, deleteStage, moveStage, sortedStages } from './actions';

  let { ctx }: { ctx: ModuleContext } = $props();
  const { t, commands, selection } = $derived(ctx);
  const store = $derived(ctx.store);
  const selected = $derived(ctx.selection.ids);

  const trip = $derived.by(() => {
    void $store;
    return store.get(ctx.tripId, 'trip');
  });
  const stages = $derived.by(() => {
    void $store;
    return sortedStages(store);
  });

  function add() {
    const cmd = addStage(store, ctx.tripId, t('tree.stageName', { n: stages.length + 1 }), t('cmd.addStage'));
    commands.run(cmd);
    selection.set([cmd.changes[0]!.id]);
  }

  function move(id: string, dir: -1 | 1) {
    const cmd = moveStage(store, id, dir, t('cmd.moveStage'));
    if (cmd) commands.run(cmd);
  }

  function renameTrip(name: string) {
    if (!trip || !name.trim() || name === trip.name) return;
    commands.run({ label: t('cmd.renameTrip'), changes: [edits.update<Trip>(store, trip.id, { name: name.trim() })] });
  }
</script>

{#if trip}
  <input
    class="trip-name"
    type="text"
    value={trip.name}
    aria-label="Trip name"
    onchange={(e) => renameTrip(e.currentTarget.value)}
  />
{/if}

<div class="list-head">
  <span class="muted">{t('tree.stages')}</span>
  <IconButton icon={icons.plus} label={t('tree.addStage')} size={16} onclick={add} />
</div>

{#if stages.length === 0}
  <p class="muted">{t('tree.empty')}</p>
{:else}
  <ol>
    {#each stages as stage, i (stage.id)}
      <li class:selected={$selected.includes(stage.id)}>
        <button type="button" class="name" onclick={() => selection.set([stage.id])}>
          <span class="swatch" style:background={stage.color ?? 'var(--accent)'}></span>
          {stage.name}
        </button>
        <span class="actions">
          <IconButton icon={icons.up} label={t('tree.moveUp')} size={14} disabled={i === 0} onclick={() => move(stage.id, -1)} />
          <IconButton
            icon={icons.down}
            label={t('tree.moveDown')}
            size={14}
            disabled={i === stages.length - 1}
            onclick={() => move(stage.id, 1)}
          />
          <IconButton
            icon={icons.trash}
            label={t('tree.delete')}
            size={14}
            onclick={() => commands.run(deleteStage(store, stage.id, t('cmd.deleteStage')))}
          />
        </span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .trip-name {
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 15px;
    border-color: transparent;
    background: transparent;
    padding-left: 4px;
  }

  .trip-name:hover,
  .trip-name:focus {
    border-color: var(--border);
    background: var(--bg);
  }

  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  ol {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  li:hover {
    background: var(--bg-hover);
  }

  li.selected {
    background: var(--accent-soft);
  }

  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 4px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .actions {
    display: flex;
    opacity: 0;
  }

  li:hover .actions,
  li:focus-within .actions,
  li.selected .actions {
    opacity: 1;
  }

  .actions :global(.icon-btn) {
    width: 26px;
    height: 26px;
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }
  }
</style>
