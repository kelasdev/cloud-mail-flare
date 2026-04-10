<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import UserListPanel from '$lib/components/organisms/UserListPanel.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';

  $: normalizedQuery = searchQuery.trim().toLowerCase();
  $: filteredUsers = normalizedQuery
    ? data.users.filter((user) =>
        [user.displayName, user.email, user.role, user.status].some((field) =>
          field.toLowerCase().includes(normalizedQuery)
        )
      )
    : data.users;

  async function handleUserCreated() {
    await invalidateAll();
  }

  async function handleUserChanged() {
    await invalidateAll();
  }
</script>

<div class="layout-shell">
  <AppSidebar active="users" />
  <section class="main">
    <AppTopbar
      title="User List"
      breadcrumb="mailflare / users"
      bind:searchQuery
      searchPlaceholder="Search user by name, email, role..."
      showMenuButton={false}
    />
    <div class="content">
      <UserListPanel users={filteredUsers} on:usercreated={handleUserCreated} on:userchanged={handleUserChanged} />
    </div>
  </section>
</div>

<style>
  .content {
    padding: var(--space-5);
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-3);
    }
  }
</style>
