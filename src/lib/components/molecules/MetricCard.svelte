<script lang="ts">
  import Badge from '$lib/components/atoms/Badge.svelte';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let icon = 'insights';
  export let label = '';
  export let value = '';
  export let delta = '';
  export let status: 'ok' | 'warning' | 'critical' = 'ok';
</script>

<CardSurface>
  <div class="header">
    <div class="icon-wrap">
      <Icon name={icon} size={18} />
    </div>
    <Badge tone={status === 'ok' ? 'success' : status === 'warning' ? 'warning' : 'danger'}>{status}</Badge>
  </div>
  <div class="value">{value}</div>
  <div class="label">{label}</div>
  {#if delta}
    <div class="delta">{delta}</div>
  {/if}
</CardSurface>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .icon-wrap {
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 90%);
    color: var(--color-primary-500);
    border-radius: var(--radius-md);
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
  }

  .value {
    font-size: 1.9rem;
    font-family: var(--font-family-headline);
    font-weight: 800;
  }

  .label {
    margin-top: 0.25rem;
    color: var(--color-text-muted);
    font-weight: 600;
    font-size: 0.8rem;
  }

  .delta {
    margin-top: 0.5rem;
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
  }

  @media (max-width: 768px) {
    .value {
      font-size: 1.4rem;
    }
    
    .header {
      margin-bottom: var(--space-2);
    }

    .icon-wrap {
      width: 1.7rem;
      height: 1.7rem;
    }
    
    /* Make the icon match the smaller wrap */
    .icon-wrap :global(.icon) {
      font-size: 16px !important;
    }
  }
</style>
