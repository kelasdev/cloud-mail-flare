<script lang="ts">
  export let id = '';
  export let value = '';
  export let placeholder = '';
  export let type: 'text' | 'password' | 'email' | 'search' = 'text';
  export let readonly = false;
  export let name = '';
  export let required = false;
</script>

<input
  class="input"
  {id}
  {name}
  {type}
  bind:value
  {placeholder}
  {readonly}
  {required}
/>

<style>
  .input {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 55%);
    background: color-mix(in srgb, var(--color-surface-low), var(--color-surface-card) 40%);
    color: var(--color-text);
    padding: 0.75rem 0.875rem;
    border-radius: var(--radius-md);
    outline: none;
  }

  .input:focus {
    border-color: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 45%);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-500), transparent 85%);
    background: var(--color-surface-card);
  }
</style>
