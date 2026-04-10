<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { sidebarCollapsed, darkMode } from '$lib/stores/ui.store';
  import SearchField from '$lib/components/molecules/SearchField.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let title = 'MailFlare';
  export let breadcrumb = '';
  export let showSearch = true;
  export let searchQuery = '';
  export let searchPlaceholder = 'Search...';
  export let showRefresh = true;
  export let showLogout = true;
  export let showMenuButton = true;
  export let showThemeToggle = true;

  let refreshing = false;
  let loggingOut = false;

  async function handleRefresh() {
    if (refreshing || loggingOut) {
      return;
    }

    refreshing = true;
    try {
      await invalidateAll();
    } finally {
      refreshing = false;
    }
  }

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    loggingOut = true;
    try {
      await fetch('/api/auth/logout');
    } finally {
      await goto('/auth/login');
      loggingOut = false;
    }
  }

  function handleThemeToggle() {
    darkMode.update((value) => !value);
  }
</script>

<header class="topbar">
  <div class="left">
    {#if showMenuButton}
      <button class="mobile-menu" type="button" aria-label="Open navigation menu" on:click={() => sidebarCollapsed.set(false)}>
        <Icon name="menu" size={18} />
      </button>
    {/if}
    <div class="crumb">{breadcrumb}</div>
    <h1>{title}</h1>
  </div>
  <div class="right">
    {#if showSearch}
      <div class="search">
        <SearchField bind:value={searchQuery} placeholder={searchPlaceholder} />
      </div>
    {/if}
    <slot name="actions" />
    {#if showRefresh}
      <Button variant="secondary" disabled={refreshing || loggingOut} on:click={handleRefresh}>
        <Icon name="refresh" size={18} />
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </Button>
    {/if}
    {#if showThemeToggle}
      <button
        class="icon-action"
        type="button"
        aria-label={$darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        on:click={handleThemeToggle}
      >
        <Icon name={$darkMode ? 'light_mode' : 'dark_mode'} size={18} />
      </button>
    {/if}
    {#if showLogout}
      <Button variant="ghost" disabled={loggingOut} on:click={handleLogout}>
        <Icon name="logout" size={18} />
        {loggingOut ? 'Logging out...' : 'Logout'}
      </Button>
    {/if}
  </div>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-5);
    padding: 0.9rem 1.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 60%);
    background: color-mix(in srgb, var(--color-surface-card), transparent 12%);
    backdrop-filter: blur(10px);
  }

  .left h1 {
    font-size: 1rem;
    margin-top: 0.2rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .crumb {
    font-size: var(--font-size-label-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .search {
    width: min(28rem, 42vw);
  }

  .mobile-menu {
    display: none;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 55%);
    background: var(--color-surface-low);
    border-radius: var(--radius-md);
    color: var(--color-text);
    width: 2.1rem;
    height: 2.1rem;
    align-items: center;
    justify-content: center;
  }

  .icon-action {
    width: 2.45rem;
    height: 2.45rem;
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 50%);
    background: transparent;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
  }

  .icon-action:hover {
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-outline), transparent 28%);
    background: color-mix(in srgb, var(--color-surface-low), transparent 10%);
  }

  @media (max-width: 960px) {
    .topbar {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--space-3);
      padding: 0.75rem 0.9rem;
    }

    .left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      width: 100%;
    }

    .left h1 {
      margin-top: 0;
      font-size: 0.95rem;
    }

    .crumb {
      display: none;
    }

    .right {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .search {
      width: 100%;
      min-width: min(18rem, 100%);
    }

    .right :global(.btn),
    .icon-action {
      flex: 0 0 auto;
    }

    .mobile-menu {
      display: inline-flex;
    }
  }
</style>
