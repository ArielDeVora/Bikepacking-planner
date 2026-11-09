<script lang="ts">
  import { readable } from 'svelte/store';
  import type { ToolSpec } from '../core/ui';
  import IconButton from '../lib/ui/IconButton.svelte';

  let { tool, label }: { tool: ToolSpec; label: string } = $props();
  const off = readable(false);
  const active = $derived(tool.active ?? off);
  const disabled = $derived(tool.disabled ?? off);
</script>

<IconButton icon={tool.icon} {label} active={$active} disabled={$disabled} onclick={tool.run} />
