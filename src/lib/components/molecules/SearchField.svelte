<script lang="ts">
  import Icon from '$lib/components/atoms/Icon.svelte';
  export let value = '';
  export let placeholder = 'Search...';
  export let onSearch: (() => void) | undefined = undefined;
  export let searchLabel = 'Cari';

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && onSearch) {
      event.preventDefault();
      onSearch();
    }
  }
</script>

<label class="search">
  <span class="icon"><Icon name="search" size={18} /></span>
  <input
    bind:value
    {placeholder}
    type="search"
    on:keydown={handleKeydown}
  />
  {#if onSearch}
    <button
      type="button"
      class="submit"
      aria-label="Submit search"
      on:click={onSearch}
    >
      {searchLabel}
    </button>
  {/if}
</label>

<style>
  .search {
    display: block;
    position: relative;
    width: 100%;
  }

  .icon {
    position: absolute;
    left: 0.8rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  input {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 55%);
    background: color-mix(in srgb, var(--color-surface-low), var(--color-surface-card) 40%);
    color: var(--color-text);
    border-radius: var(--radius-pill);
    padding: 0.62rem 0.95rem 0.62rem 2.4rem;
    outline: none;
  }

  input:focus {
    border-color: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 45%);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-500), transparent 85%);
    background: var(--color-surface-card);
  }

  .submit {
    position: absolute;
    right: 0.3rem;
    top: 50%;
    transform: translateY(-50%);
    border: 0;
    background: var(--gradient-signature);
    color: #fff;
    font-weight: 700;
    font-size: 0.78rem;
    padding: 0.4rem 0.95rem;
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: opacity 120ms ease, transform 120ms ease;
  }

  .submit:hover {
    opacity: 0.92;
  }

  .submit:active {
    transform: translateY(-50%) scale(0.97);
  }
</style>
