<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { sidebarCollapsed, darkMode } from '$lib/stores/ui.store';
  import BrandLockup from '$lib/components/molecules/BrandLockup.svelte';
  import SidebarNavItem from '$lib/components/molecules/SidebarNavItem.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let active: 'dashboard' | 'users' | 'worker' = 'dashboard';
  export let adminEmail: string | null = null;

  $: compact = $sidebarCollapsed;
  $: adminInitial = adminEmail ? adminEmail.charAt(0).toUpperCase() : '';
  $: adminName = adminEmail ? adminEmail.split('@')[0] : '';

  let sidebarElement: HTMLElement | null = null;
  let isMobileViewport = false;
  let releaseOutsideHandler: (() => void) | null = null;
  let loggingOut = false;

  function bindOutsideCollapse() {
    releaseOutsideHandler?.();
    releaseOutsideHandler = null;

    if (typeof window === 'undefined' || compact || isMobileViewport) {
      return;
    }

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (compact || isMobileViewport) {
        return;
      }

      const target = event.target as Node | null;
      if (!target || !sidebarElement) {
        return;
      }

      const eventPath = 'composedPath' in event ? event.composedPath() : [];
      if (Array.isArray(eventPath) && sidebarElement && eventPath.includes(sidebarElement)) {
        return;
      }

      if (!sidebarElement.contains(target)) {
        sidebarCollapsed.set(true);
      }
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    releaseOutsideHandler = () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }

  async function handleLogout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await fetch('/api/auth/logout');
    } finally {
      await goto('/auth/login');
      loggingOut = false;
    }
  }

  onMount(() => {
    const media = window.matchMedia('(max-width: 960px)');
    isMobileViewport = media.matches;
    bindOutsideCollapse();

    const handleViewportChange = (event: MediaQueryListEvent) => {
      isMobileViewport = event.matches;
      if (event.matches) {
        sidebarCollapsed.set(true);
      }
      bindOutsideCollapse();
    };

    media.addEventListener('change', handleViewportChange);
    return () => {
      media.removeEventListener('change', handleViewportChange);
      releaseOutsideHandler?.();
    };
  });

  $: bindOutsideCollapse();
</script>

{#if !compact}
  <button class="backdrop" type="button" aria-label="Collapse sidebar overlay" on:click={() => sidebarCollapsed.set(true)}></button>
{/if}

<aside bind:this={sidebarElement} class={`sidebar ${compact ? 'collapsed' : ''}`}>
  <div class="brand-wrap">
    <BrandLockup compact={compact} />
  </div>

  <nav class="nav">
    <SidebarNavItem href="/dashboard" icon="dashboard" label="Dashboard" active={active === 'dashboard'} compact={compact} />
    <SidebarNavItem href="/users" icon="group" label="User List" active={active === 'users'} compact={compact} />
    <SidebarNavItem href="/worker/settings" icon="settings_input_component" label="Worker Settings" active={active === 'worker'} compact={compact} />
  </nav>

  <div class="sidebar-bottom">
    {#if adminEmail}
      <div class="admin-info" title={adminEmail}>
        <span class="admin-avatar">{adminInitial}</span>
        {#if !compact}
          <span class="admin-name">{adminName}</span>
        {/if}
      </div>
    {/if}

    <div class="bottom-actions">
      <button
        class="sidebar-action"
        type="button"
        aria-label={compact ? 'Switch theme' : ($darkMode ? 'Light mode' : 'Dark mode')}
        on:click={() => darkMode.update(v => !v)}
        title={compact ? 'Switch theme' : ''}
      >
        <Icon name={$darkMode ? 'light_mode' : 'dark_mode'} size={18} />
        {#if !compact}
          <span>{$darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        {/if}
      </button>

      <button
        class="sidebar-action"
        type="button"
        aria-label="Collapse sidebar"
        on:click={() => sidebarCollapsed.update((value) => !value)}
        title={compact ? 'Expand sidebar' : ''}
      >
        <Icon name={compact ? 'menu' : 'menu_open'} size={18} />
        {#if !compact}
          <span>Ciutkan</span>
        {/if}
      </button>

      <button
        class="sidebar-action logout"
        type="button"
        aria-label="Logout"
        disabled={loggingOut}
        on:click={handleLogout}
        title={compact ? 'Logout' : ''}
      >
        <Icon name="logout" size={18} />
        {#if !compact}
          <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
        {/if}
      </button>
    </div>
  </div>
</aside>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    background: color-mix(in srgb, var(--color-text), transparent 88%);
    backdrop-filter: blur(1px);
    z-index: 8;
    display: none;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    height: 100vh;
    padding: var(--space-4);
    background: color-mix(in srgb, var(--color-surface-card), transparent 26%);
    border-right: 1px solid color-mix(in srgb, var(--color-outline), transparent 68%);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: var(--size-sidebar-expanded);
    backdrop-filter: blur(14px) saturate(125%);
    box-shadow: 0 18px 46px rgba(0, 43, 140, 0.16);
    z-index: 9;
    overflow-y: auto;
    transition: width 180ms ease, transform 180ms ease, background-color 180ms ease;
  }

  .collapsed {
    width: var(--size-sidebar-collapsed);
    box-shadow: none;
    background: color-mix(in srgb, var(--color-surface-card), transparent 36%);
  }

  .brand-wrap {
    padding: 0.25rem;
  }

  .nav {
    flex: 1;
    display: grid;
    align-content: start;
    gap: 0.35rem;
  }

  .sidebar-bottom {
    margin-top: auto;
    border-top: 1px solid color-mix(in srgb, var(--color-outline), transparent 70%);
    padding-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .admin-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0.45rem 0.5rem;
    border-radius: var(--radius-md);
    min-height: 2.25rem;
  }

  .collapsed .admin-info {
    justify-content: center;
    padding: 0.45rem 0;
  }

  .admin-avatar {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--gradient-signature);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 0.7rem;
    font-family: var(--font-family-headline);
    flex-shrink: 0;
  }

  .admin-name {
    font-size: var(--font-size-body-sm);
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bottom-actions {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .sidebar-action {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--font-size-body-sm);
    font-family: inherit;
    cursor: pointer;
    transition: color 120ms ease, background-color 120ms ease;
    width: 100%;
    text-align: left;
    min-height: 2.25rem;
  }

  .collapsed .sidebar-action {
    justify-content: center;
    padding: 0.5rem 0;
  }

  .sidebar-action:hover {
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-surface-low), transparent 20%);
  }

  .sidebar-action.logout {
    color: var(--color-danger);
  }

  .sidebar-action.logout:hover {
    background: color-mix(in srgb, var(--color-danger), var(--color-surface-card) 92%);
  }

  @media (max-width: 960px) {
    .backdrop {
      display: block;
    }

    .sidebar {
      width: min(84vw, var(--size-sidebar-expanded));
      min-width: 15.5rem;
      padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
      transform: translateX(calc(-100% - 0.5rem));
    }

    .collapsed {
      width: min(84vw, var(--size-sidebar-expanded));
      transform: translateX(calc(-100% - 0.5rem));
    }

    .sidebar:not(.collapsed) {
      transform: translateX(0);
    }
  }
</style>
