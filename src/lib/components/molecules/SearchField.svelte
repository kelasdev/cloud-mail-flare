<script lang="ts">
  import Icon from '$lib/components/atoms/Icon.svelte';
  export let value = '';
  export let placeholder = 'Search...';
</script>

<label class="search">
  <span class="icon"><Icon name="search" size={18} /></span>
  <input bind:value {placeholder} type="search" />
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
</style>
