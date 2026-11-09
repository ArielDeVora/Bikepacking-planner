<script lang="ts">
  import { untrack } from 'svelte';
  import type { Core } from '../core/core';
  import type { StringKey } from '../core/i18n';

  let { core }: { core: Core } = $props();
  const { t, shortcuts } = $derived(core);

  // Read when the dialog opens, so it lists exactly what is registered right now.
  const keys = untrack(() => core.shortcuts.list());

  const MOUSE: { title: StringKey; rows: StringKey[] }[] = [
    { title: 'help.mouse.routes', rows: ['help.mouse.draw', 'help.mouse.dragPoint', 'help.mouse.insertPoint', 'help.mouse.deletePoint', 'help.mouse.selectSegment', 'help.mouse.lineStyle'] },
    {
      title: 'help.mouse.panel',
      rows: ['help.mouse.multi', 'help.mouse.range', 'help.mouse.dragMove', 'help.mouse.dragFuse', 'help.mouse.dragStage', 'help.mouse.dragStages', 'help.mouse.eye', 'help.mouse.collapse', 'help.mouse.resize'],
    },
    { title: 'help.mouse.places', rows: ['help.mouse.basePlaces', 'help.mouse.dragPoi', 'help.mouse.zoneCorners', 'help.mouse.crossings'] },
    { title: 'help.mouse.other', rows: ['help.mouse.profileHover', 'help.mouse.profileErase', 'help.mouse.dropFiles'] },
  ];
</script>

<h2>{t('help.title')}</h2>

<div class="cols">
  <section>
    <h3>{t('help.keyboard')}</h3>
    <dl>
      {#each keys as k (k.label)}
        <div>
          <dt>{#each k.keys as combo, i (combo)}{#if i > 0}<span class="or"> / </span>{/if}<kbd>{shortcuts.format(combo)}</kbd>{/each}</dt>
          <dd>{k.label}</dd>
        </div>
      {/each}
    </dl>
    <p class="muted small">{t('help.keyboardNote')}</p>
  </section>

  <section>
    {#each MOUSE as group (group.title)}
      <h3>{t(group.title)}</h3>
      <ul>
        {#each group.rows as row (row)}<li>{t(row)}</li>{/each}
      </ul>
    {/each}
  </section>
</div>

<div class="buttons">
  <button type="button" class="btn" onclick={() => core.ui.closeDialog()}>{t('card.close')}</button>
</div>

<style>
  h2 {
    margin: 0 0 12px;
    font-size: 16px;
  }

  h3 {
    margin: 12px 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  section > h3:first-child {
    margin-top: 0;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  dl {
    display: grid;
    gap: 5px;
    margin: 0;
    font-size: 13px;
  }

  dl div {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px;
    align-items: baseline;
  }

  dt {
    text-align: right;
    white-space: nowrap;
  }

  dd {
    margin: 0;
  }

  kbd {
    display: inline-block;
    min-width: 20px;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--bg-sunken);
    font: 12px/1.4 var(--font);
    text-align: center;
  }

  .or {
    color: var(--fg-muted);
  }

  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.5;
  }

  .small {
    font-size: 12px;
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

  @media (max-width: 640px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
