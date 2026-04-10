<script lang="ts">
  import MetricCard from '$lib/components/molecules/MetricCard.svelte';
  import type { MetricDto } from '$lib/types/dto';

  export let metrics: MetricDto[] = [];

  const iconByKey: Record<string, string> = {
    users: 'group',
    emails: 'mail',
    unread: 'mark_email_unread',
    starred: 'star',
    archived: 'archive',
    deleted: 'delete'
  };
</script>

<section class="grid">
  {#each metrics as metric (metric.key)}
    <MetricCard
      icon={iconByKey[metric.key] ?? 'insights'}
      label={metric.label}
      value={metric.value}
      delta={metric.delta}
      status={metric.status ?? 'ok'}
    />
  {/each}
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-4);
  }

  @media (max-width: 768px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3);
    }
  }
</style>
