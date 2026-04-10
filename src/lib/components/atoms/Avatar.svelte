<script lang="ts">
  export let initials = 'MF';
  export let src = '';
  export let size = 36;
</script>

<div class="avatar" style={`width:${size}px;height:${size}px`}>
  {#if src}
    <img src={src} alt="avatar" />
  {:else}
    <span>{initials}</span>
  {/if}
</div>

<style>
  .avatar {
    border-radius: 9999px;
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 85%);
    color: var(--color-primary-500);
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
