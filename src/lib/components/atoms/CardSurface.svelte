<script lang="ts">
  export let padded = true;
  export let className = '';
</script>

<section class={`surface-card ${padded ? 'padded' : ''} ${className}`.trim()}>
  <slot />
</section>

<style>
  .padded {
    padding: var(--space-6);
  }

  @media (max-width: 960px) {
    .padded {
      padding: var(--space-4);
    }
  }
</style>
