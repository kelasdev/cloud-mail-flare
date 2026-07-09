<script lang="ts">
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let href = '#';
  export let icon = 'dashboard';
  export let label = '';
  export let active = false;
  export let compact = false;
</script>

<a class={`item ${active ? 'active' : ''} ${compact ? 'compact' : ''}`} {href}>
  <Icon name={icon} size={20} />
  {#if !compact}
    <span>{label}</span>
  {/if}
</a>

<style>
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-radius: var(--radius-md);
    padding: 0.6rem 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
    font-size: var(--font-size-body-sm);
    transition: color 120ms ease, background-color 120ms ease;
  }

  .item:hover {
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-surface-low), transparent 30%);
  }

  .item.active {
    color: var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 92%);
    font-weight: 600;
  }

  :global([data-theme='dark']) .item.active {
    color: var(--color-primary-700);
    background: color-mix(in srgb, var(--color-primary-700), var(--color-surface-card) 88%);
  }

  .compact {
    justify-content: center;
    padding: 0.6rem;
  }
</style>
