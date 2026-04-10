<script lang="ts">
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import WorkerSettingsForm from '$lib/components/organisms/WorkerSettingsForm.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<div class="layout-shell">
  <AppSidebar active="worker" />
  <section class="main">
    <AppTopbar title="Worker Settings" breadcrumb="mailflare / worker / settings" showSearch={false} showMenuButton={false} />
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
