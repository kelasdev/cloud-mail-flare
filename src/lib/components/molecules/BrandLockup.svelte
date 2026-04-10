<script lang="ts">
  import Icon from '$lib/components/atoms/Icon.svelte';
  export let compact = false;
</script>

<div class="brand">
  <div class="logo signature-bg">
    <Icon name="cloud" size={20} />
  </div>
  {#if !compact}
    <div>
      <div class="name">MailFlare</div>
      <div class="caption">Infrastructure</div>
    </div>
  {/if}
</div>

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    color: #fff;
    display: grid;
    place-items: center;
  }

  .name {
    font-family: var(--font-family-headline);
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .caption {
    color: var(--color-text-muted);
    font-size: var(--font-size-label-xs);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
  }
</style>
