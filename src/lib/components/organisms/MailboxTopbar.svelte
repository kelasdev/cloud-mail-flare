<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { darkMode } from '$lib/stores/ui.store';
  import SearchField from '$lib/components/molecules/SearchField.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let userLabel = '';
  export let searchQuery = '';
  export let searchPlaceholder = 'Search emails...';
  export let showSearch = true;
  export let showRefresh = true;
  export let showLogout = true;

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
  <div class="inner">
    <div class="left">
      <a class="brand" href="/me/inbox" aria-label="Go to inbox">
        <span class="brand-icon"><Icon name="cloud" size={18} /></span>
        <span class="brand-name">MailFlare</span>
      </a>
      {#if showSearch}
        <div class="search">
          <SearchField bind:value={searchQuery} placeholder={searchPlaceholder} />
        </div>
      {/if}
    </div>

    <div class="right">
      {#if showRefresh}
        <button class="icon-btn" type="button" aria-label="Refresh inbox" on:click={handleRefresh} disabled={refreshing || loggingOut}>
          <Icon name="refresh" size={18} />
        </button>
      {/if}

      <slot name="actions" />

      <button
        class="icon-btn"
        type="button"
        aria-label={$darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        on:click={handleThemeToggle}
      >
        <Icon name={$darkMode ? 'light_mode' : 'dark_mode'} size={18} />
      </button>

      {#if showLogout}
        <div class="divider" aria-hidden="true"></div>
        {#if userLabel}
          <span class="user">{userLabel}</span>
        {/if}
        <button class="logout" type="button" disabled={loggingOut} on:click={handleLogout}>
          <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
          <Icon name="logout" size={18} />
        </button>
      {/if}
    </div>
  </div>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--color-surface-card), transparent 18%);
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 78%);
    backdrop-filter: blur(12px);
    box-shadow: 0 20px 48px rgba(0, 61, 199, 0.06);
  }

  .inner {
    max-width: 80rem;
    margin: 0 auto;
    padding: 0.75rem 1.25rem;
    display: flex;
    gap: var(--space-4);
    justify-content: space-between;
    align-items: center;
  }

  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .brand-icon {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.55rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: var(--color-primary-500);
  }

  .brand-name {
    font-family: var(--font-family-headline);
    color: var(--color-primary-500);
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .search {
    width: min(42rem, 100%);
  }

  .right {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: nowrap;
    justify-content: flex-end;
    min-width: 0;
  }

  .icon-btn {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 55%);
    background: transparent;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-btn:hover {
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-surface-low), transparent 8%);
  }

  .divider {
    width: 1px;
    height: 1.8rem;
    background: color-mix(in srgb, var(--color-outline), transparent 70%);
  }

  .user {
    font-family: var(--font-family-headline);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .logout {
    border: 0;
    background: transparent;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .logout:hover {
    color: var(--color-danger);
  }

  @media (max-width: 960px) {
    .inner {
      padding: 0.65rem 0.85rem;
      flex-wrap: wrap;
    }

    .left {
      width: 100%;
    }

    .search {
      width: 100%;
    }

    .right {
      width: 100%;
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 0.1rem;
      scrollbar-width: thin;
    }

    .right :global(.btn),
    .icon-btn,
    .logout,
    .user {
      flex: 0 0 auto;
    }

    .divider,
    .user {
      display: none;
    }
  }
</style>
