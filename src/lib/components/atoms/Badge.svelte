<script lang="ts">
  export let tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
</script>

<span class={`badge badge-${tone}`}><slot /></span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.55rem;
  }

  .badge-neutral {
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-outline), var(--color-surface-card) 75%);
  }

  .badge-primary {
    color: var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 90%);
  }

  .badge-success {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success), var(--color-surface-card) 88%);
  }

  .badge-warning {
    color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning), var(--color-surface-card) 88%);
  }

  .badge-danger {
    color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger), var(--color-surface-card) 88%);
  }
</style>
