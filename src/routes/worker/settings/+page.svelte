<script lang="ts">
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import WorkerSettingsForm from '$lib/components/organisms/WorkerSettingsForm.svelte';
  import { page } from '$app/stores';
  import { sidebarCollapsed } from '$lib/stores/ui.store';
  import type { PageData } from './$types';

  export let data: PageData;
  $: adminEmail = $page.data.sessionEmail ?? null;
</script>

<div class="layout-shell">
  <AppSidebar active="worker" adminEmail={adminEmail} />
  <section class="main" class:sidebar-collapsed={$sidebarCollapsed}>
    <AppTopbar title="Worker Settings"
      variant="minimal"
      showRefresh={false}
      showLogout={false} breadcrumb="mailflare / worker / settings" showSearch={false} />
    <div class="content">
      <WorkerSettingsForm data={data.workerSettings} />
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
