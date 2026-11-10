<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Shows its content, or a short message if it fails, so one broken part doesn't take the rest of the page down. */
  let { message, children }: { message: string; children: Snippet } = $props();

  function report(error: unknown) {
    console.error(error);
  }
</script>

<svelte:boundary onerror={report}>
  {@render children()}
  {#snippet failed(_error, reset)}
    <p class="failed">
      {message}
      <button type="button" onclick={reset}>↻</button>
    </p>
  {/snippet}
</svelte:boundary>

<style>
  .failed {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    color: var(--danger);
    font-size: 12px;
  }

  button {
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }
</style>
