<script lang="ts">
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import DashboardMetricsGrid from '$lib/components/organisms/DashboardMetricsGrid.svelte';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<div class="layout-shell">
  <AppSidebar active="dashboard" />
  <section class="main">
    <AppTopbar title="System Overview" breadcrumb="mailflare / dashboard" showSearch={false} showMenuButton={false} />
    <div class="content">
      <DashboardMetricsGrid metrics={data.dashboard.metrics} />
      <CardSurface>
        <div class="footer">
          <div>
            <h3>Worker Health</h3>
            <p class="text-muted">Health checked continuously via Cloudflare Worker.</p>
          </div>
          <Badge tone="success">Operational</Badge>
        </div>
      </CardSurface>
    </div>
  </section>
</div>

<style>
  .main {
    min-width: 0;
  }

  .content {
    padding: var(--space-5);
    display: grid;
    gap: var(--space-5);
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
  }

  h3 {
    margin-bottom: 0.3rem;
    font-size: 1.1rem;
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-3);
      gap: var(--space-4);
    }

    .footer {
      flex-wrap: wrap;
      align-items: flex-start;
    }
  }
</style>
