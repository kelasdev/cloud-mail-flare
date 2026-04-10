<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Icon from '$lib/components/atoms/Icon.svelte';

  const items = [
    { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: 'users', href: '/users', label: 'Users', icon: 'group' },
    { key: 'worker', href: '/worker/settings', label: 'Worker', icon: 'settings_input_component' }
  ] as const;

  let optimisticKey: (typeof items)[number]['key'] | '' = '';

  function normalizePath(path: string): string {
    return (path || '/').replace(/\/+$/, '') || '/';
  }

  function resolveActiveKey(path: string): (typeof items)[number]['key'] | '' {
    if (path.startsWith('/worker')) return 'worker';
    if (path.startsWith('/users')) return 'users';
    if (path.startsWith('/dashboard')) return 'dashboard';
    return '';
  }

  $: pathname = normalizePath($page.url.pathname);
  $: routeActiveKey = resolveActiveKey(pathname);
  $: activeKey = optimisticKey || routeActiveKey;
  $: if (optimisticKey && routeActiveKey === optimisticKey) optimisticKey = '';

  async function handleNavigate(event: MouseEvent, item: (typeof items)[number]) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    optimisticKey = item.key;
    await goto(item.href);
  }
</script>

<nav class="mobile-nav" aria-label="Mobile Navigation">
  {#each items as item}
    <a href={item.href} class={`item ${activeKey === item.key ? 'active' : ''}`} on:click={(event) => handleNavigate(event, item)}>
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: none;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.25rem;
    min-height: var(--mobile-nav-height);
    padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
    border-top: 1px solid color-mix(in srgb, var(--color-outline), transparent 62%);
    background: color-mix(in srgb, var(--color-surface-card), transparent 8%);
    backdrop-filter: blur(12px);
  }

  .item {
    min-height: 3.3rem;
    border-radius: var(--radius-md);
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.2rem;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .item.active {
    color: var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500), transparent 90%);
  }

  .item span {
    white-space: nowrap;
  }

  @media (max-width: 960px) {
    .mobile-nav {
      display: grid;
    }
  }
</style>
