<script lang="ts">
  import InputText from '$lib/components/atoms/InputText.svelte';

  export let label = '';
  export let value = '';
  export let placeholder = '';
  export let readonly = false;
  export let type: 'text' | 'password' | 'email' | 'search' = 'text';
  export let id = '';
</script>

<div class="field">
  <label for={id}>{label}</label>
  <InputText {id} bind:value {placeholder} {readonly} {type} />
</div>

<style>
  .field {
    display: grid;
    gap: 0.4rem;
  }

  label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }
</style>
