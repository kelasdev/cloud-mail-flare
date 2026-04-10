<script lang="ts">
  export let type: 'button' | 'submit' = 'button';
  export let variant: 'primary' | 'secondary' | 'ghost' = 'primary';
  export let fullWidth = false;
  export let disabled = false;
  export let href = '';
</script>

{#if href}
  <a class={`btn btn-${variant} ${fullWidth ? 'btn-full' : ''}`} {href}>
    <slot />
  </a>
{:else}
  <button class={`btn btn-${variant} ${fullWidth ? 'btn-full' : ''}`} {type} {disabled} on:click>
    <slot />
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border: 0;
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-weight: 700;
    transition: transform 120ms ease, opacity 120ms ease, background-color 120ms ease;
  }

  .btn:hover {
    opacity: 0.95;
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-full {
    width: 100%;
  }

  .btn-primary {
    color: #ffffff;
    background: var(--gradient-signature);
    box-shadow: 0 10px 24px rgba(0, 81, 255, 0.25);
  }

  .btn-secondary {
    color: var(--color-text);
    background: var(--color-surface-low);
  }

  .btn-ghost {
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 50%);
  }
</style>
