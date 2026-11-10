<script lang="ts">
  import { KEYS } from '../config/shortcuts';
  import type { Core } from '../core/core';
  import type { ToolSpec } from '../core/ui';
  import { icons } from '../lib/icons';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Cheatsheet from './Cheatsheet.svelte';
  import ToolButton from './ToolButton.svelte';

  let { core, shifted }: { core: Core; shifted: boolean } = $props();
  const { t, commands, shortcuts } = $derived(core);
  const history = $derived(core.commands.state);
  const tools = $derived(core.ui.tools);

  const undoLabel = $derived(
    ($history.undoLabel ? t('toolbar.undoNamed', { label: $history.undoLabel }) : t('toolbar.undo')) +
      ` (${shortcuts.format(KEYS.undo)})`,
  );
  const redoLabel = $derived(
    ($history.redoLabel ? t('toolbar.redoNamed', { label: $history.redoLabel }) : t('toolbar.redo')) +
      ` (${shortcuts.format(KEYS.redo)})`,
  );

  const toolLabel = (tool: ToolSpec) => (tool.shortcut ? `${tool.label} (${shortcuts.format(tool.shortcut)})` : tool.label);
</script>

<nav class="toolbar" class:shifted aria-label="Tools">
  {#each $tools as tool (tool.id)}
    <ToolButton {tool} label={toolLabel(tool)} />
  {/each}
  {#if $tools.length}<hr />{/if}
  <IconButton icon={icons.undo} label={undoLabel} disabled={!$history.canUndo} onclick={() => commands.undo()} />
  <IconButton icon={icons.redo} label={redoLabel} disabled={!$history.canRedo} onclick={() => commands.redo()} />
  <hr />
  <IconButton icon={icons.help} label={`${t('help.title')} (${shortcuts.format(KEYS.help)})`} onclick={() => core.ui.openDialog(Cheatsheet, { core })} />
</nav>

<style>
  .toolbar {
    position: absolute;
    top: var(--gap);
    left: calc(var(--gap) + 48px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    transition: left 0.18s ease;
  }

  .toolbar.shifted {
    left: calc(var(--panel-w) + 2 * var(--gap));
  }

  hr {
    width: 100%;
    margin: 2px 0;
    border: 0;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 640px) {
    .toolbar,
    .toolbar.shifted {
      left: var(--gap);
      top: calc(var(--gap) + 48px);
    }
  }
</style>
