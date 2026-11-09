<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    icon,
    label,
    onclick,
    disabled = false,
    active = false,
    size = 18,
  }: {
    icon: string;
    label: string;
    onclick: (e: MouseEvent) => void;
    disabled?: boolean;
    active?: boolean;
    size?: number;
  } = $props();
</script>

<button type="button" class="icon-btn" class:active title={label} aria-label={label} aria-pressed={active || undefined} {disabled} {onclick}>
  <Icon d={icon} {size} />
</button>
