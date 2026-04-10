<script lang="ts">
  export let checked = false;
  export let name = '';
  export let id = '';
</script>

<input class="checkbox" type="checkbox" bind:checked {name} {id} />

<style>
  .checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--color-primary-500);
  }
</style>
