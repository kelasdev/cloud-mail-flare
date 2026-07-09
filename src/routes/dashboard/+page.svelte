<script lang="ts">
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import DashboardMetricsGrid from '$lib/components/organisms/DashboardMetricsGrid.svelte';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import { sidebarCollapsed } from '$lib/stores/ui.store';
  import type {
    DashboardActivityEntryDto,
    DashboardMetricDto,
    DashboardPipelineDto,
    DashboardSystemHealthDto,
    DashboardUserInsightsDto,
    DashboardUserSummaryDto,
    DashboardWorkerStatus
  } from '$lib/types/dto';

  export let data: PageData;

  $: dashboard = data.dashboard;
  $: metrics = dashboard.metrics;
  $: pipeline = dashboard.pipeline;
  $: users = dashboard.users;
  $: system = dashboard.system;
  $: recentActivity = dashboard.recentActivity;
  $: generatedAtLabel = formatTimestamp(dashboard.generatedAt);
  $: adminEmail = $page.data.sessionEmail ?? null;
  $: greeting = buildGreeting();

  const workerTone: Record<DashboardWorkerStatus, 'success' | 'warning' | 'danger'> = {
    operational: 'success',
    degraded: 'warning',
    down: 'danger'
  };

  const workerLabel: Record<DashboardWorkerStatus, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    down: 'Down'
  };

  function formatTimestamp(value: string): string {
    if (!value) {
      return 'baru saja';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function formatRelative(value: string): string {
    if (!value) {
      return 'baru saja';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) {
      return 'baru saja';
    }
    if (diff < 3_600_000) {
      const m = Math.floor(diff / 60_000);
      return `${m} menit lalu`;
    }
    if (diff < 86_400_000) {
      const h = Math.floor(diff / 3_600_000);
      return `${h} jam lalu`;
    }
    const d = Math.floor(diff / 86_400_000);
    return `${d} hari lalu`;
  }

  function buildGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat pagi';
    if (hour < 15) return 'Selamat siang';
    if (hour < 19) return 'Selamat sore';
    return 'Selamat malam';
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getMetricTone(metric: DashboardMetricDto): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
    return metric.tone ?? (metric.status === 'warning' ? 'warning' : metric.status === 'critical' ? 'danger' : 'primary');
  }

  function getMetricIcon(metric: DashboardMetricDto): string {
    return metric.icon ?? 'insights';
  }

  $: pipelineSegments = buildPipelineSegments(pipeline);
  $: pipelineTotal = Math.max(pipeline.total, 1);

  function buildPipelineSegments(p: DashboardPipelineDto) {
    const segments = [
      { key: 'read', label: 'Read', value: p.read, tone: 'success' as const },
      { key: 'unread', label: 'Unread', value: p.unread, tone: 'warning' as const },
      { key: 'starred', label: 'Starred', value: p.starred, tone: 'primary' as const },
      { key: 'archived', label: 'Archived', value: p.archived, tone: 'neutral' as const },
      { key: 'deleted', label: 'Deleted', value: p.deleted, tone: 'danger' as const }
    ];
    return segments.filter((seg) => seg.value > 0);
  }

  function getActivityIcon(action: string): string {
    const normalized = action.toLowerCase();
    if (normalized.includes('star')) return 'star';
    if (normalized.includes('archive')) return 'archive';
    if (normalized.includes('delete') || normalized.includes('trash')) return 'delete';
    if (normalized.includes('read') || normalized.includes('mark')) return 'drafts';
    if (normalized.includes('create') || normalized.includes('inbound')) return 'mark_email_read';
    if (normalized.includes('login')) return 'login';
    if (normalized.includes('logout')) return 'logout';
    return 'history';
  }

  function getActivityTone(action: string): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
    const normalized = action.toLowerCase();
    if (normalized.includes('star')) return 'warning';
    if (normalized.includes('archive')) return 'neutral';
    if (normalized.includes('delete') || normalized.includes('trash')) return 'danger';
    if (normalized.includes('read') || normalized.includes('mark')) return 'success';
    return 'primary';
  }

  function attachmentRatio(p: DashboardPipelineDto): number {
    const live = Math.max(p.total - p.deleted, 0);
    if (live === 0) return 0;
    return Math.min(100, Math.round((p.withAttachments / live) * 100));
  }

  function unreadRatio(p: DashboardPipelineDto): number {
    const live = Math.max(p.total - p.deleted, 0);
    if (live === 0) return 0;
    return Math.min(100, Math.round((p.unread / live) * 100));
  }
</script>

<div class="layout-shell">
  <AppSidebar active="dashboard" adminEmail={adminEmail} />
  <section class="main" class:sidebar-collapsed={$sidebarCollapsed}>
    <AppTopbar
      title="Dashboard"
      variant="minimal"
      showSearch={false}
      showMenuButton={false}
      showRefresh={false}
      showLogout={false}
    />
    <div class="content">
      <CardSurface className="hero">
        <div class="hero-grid">
          <div class="hero-text">
            <p class="hero-eyebrow">MailFlare Infrastructure</p>
            <h2 class="hero-title">{greeting}, MAS</h2>
            <p class="hero-sub">
              Ringkasan operasional mailbox, user, dan worker. Data terakhir disinkron
              <strong>{generatedAtLabel}</strong>.
            </p>
          </div>
          <div class="hero-actions">
            <Button variant="secondary" href="/users">
              <Icon name="group" size={18} />
              Kelola User
            </Button>
            <Button variant="primary" href="/users/add">
              <Icon name="person_add" size={18} />
              Tambah User
            </Button>
          </div>
        </div>
      </CardSurface>

      <section class="block">
        <header class="block-head">
          <div>
            <h3>Key Metrics</h3>
            <p class="block-sub">Snapshot angka utama lintas modul.</p>
          </div>
          <Badge tone="primary">{metrics.length} indikator</Badge>
        </header>
        <div class="kpi-grid">
          {#each metrics as metric (metric.key)}
            <CardSurface padded={true} className="kpi-card tone-{getMetricTone(metric)}">
              <div class="kpi-head">
                <div class="kpi-icon">
                  <Icon name={getMetricIcon(metric)} size={18} />
                </div>
                <Badge
                  tone={metric.status === 'warning'
                    ? 'warning'
                    : metric.status === 'critical'
                    ? 'danger'
                    : getMetricTone(metric) === 'success'
                    ? 'success'
                    : 'neutral'}
                >
                  {metric.status ?? 'ok'}
                </Badge>
              </div>
              <div class="kpi-value">{metric.value}</div>
              <div class="kpi-label">{metric.label}</div>
              {#if metric.hint}
                <div class="kpi-hint">{metric.hint}</div>
              {/if}
              {#if metric.delta}
                <div class="kpi-delta">{metric.delta}</div>
              {/if}
            </CardSurface>
          {/each}
        </div>
      </section>

      <section class="block">
        <header class="block-head">
          <div>
            <h3>Email Pipeline</h3>
            <p class="block-sub">Distribusi status email dan utilisasi penyimpanan.</p>
          </div>
          <Badge tone="primary">{pipeline.total.toLocaleString('id-ID')} total</Badge>
        </header>
        <CardSurface>
          <div class="pipeline-summary">
            <div class="pipeline-stat">
              <span class="pipeline-stat-label">Hari ini</span>
              <span class="pipeline-stat-value">{pipeline.receivedToday.toLocaleString('id-ID')}</span>
            </div>
            <div class="pipeline-stat">
              <span class="pipeline-stat-label">7 hari terakhir</span>
              <span class="pipeline-stat-value">{pipeline.receivedLast7Days.toLocaleString('id-ID')}</span>
            </div>
            <div class="pipeline-stat">
              <span class="pipeline-stat-label">Rata-rata ukuran</span>
              <span class="pipeline-stat-value">{pipeline.averageSizeKb.toLocaleString('id-ID')} KB</span>
            </div>
            <div class="pipeline-stat">
              <span class="pipeline-stat-label">Total penyimpanan</span>
              <span class="pipeline-stat-value">{pipeline.totalSizeMb.toLocaleString('id-ID')} MB</span>
            </div>
          </div>

          <div class="pipeline-bar" role="img" aria-label="Distribusi status email">
            {#each pipelineSegments as segment (segment.key)}
              <span
                class="seg seg-{segment.tone}"
                style:flex-grow={Math.max(segment.value, 0.0001)}
                title="{segment.label}: {segment.value.toLocaleString('id-ID')}"
              ></span>
            {/each}
            {#if pipelineSegments.length === 0}
              <span class="seg-empty">Belum ada data email</span>
            {/if}
          </div>

          <div class="pipeline-legend">
            {#each pipelineSegments as segment (segment.key)}
              <span class="legend-item">
                <span class="legend-dot legend-{segment.tone}"></span>
                <span class="legend-label">{segment.label}</span>
                <span class="legend-value">{segment.value.toLocaleString('id-ID')}</span>
                <span class="legend-pct">
                  {Math.round((segment.value / pipelineTotal) * 100)}%
                </span>
              </span>
            {/each}
          </div>

          <div class="pipeline-progress">
            <div class="progress-row">
              <div class="progress-meta">
                <span>Unread ratio</span>
                <span>{unreadRatio(pipeline)}%</span>
              </div>
              <div class="progress-track">
                <span class="progress-fill fill-warning" style:width="{unreadRatio(pipeline)}%"></span>
              </div>
            </div>
            <div class="progress-row">
              <div class="progress-meta">
                <span>With attachments</span>
                <span>{attachmentRatio(pipeline)}%</span>
              </div>
              <div class="progress-track">
                <span class="progress-fill fill-primary" style:width="{attachmentRatio(pipeline)}%"></span>
              </div>
            </div>
          </div>
        </CardSurface>
      </section>

      <div class="two-col">
        <section class="block">
          <header class="block-head">
            <div>
              <h3>User Insights</h3>
              <p class="block-sub">Komposisi user dan aktivitas tertinggi.</p>
            </div>
            <Badge tone="primary">{users.total} user</Badge>
          </header>
          <CardSurface>
            <div class="insights-grid">
              <div class="insight-stat">
                <span class="insight-label">Telegram aktif</span>
                <span class="insight-value">{users.telegramEnabled}</span>
              </div>
              <div class="insight-stat">
                <span class="insight-label">Telegram nonaktif</span>
                <span class="insight-value">{users.telegramDisabled}</span>
              </div>
            </div>
            <div class="insights-divider"></div>
            <div class="top-users-head">
              <span>Top user aktif</span>
              <a href="/users" class="see-all">Lihat semua</a>
            </div>
            {#if users.topActive.length === 0}
              <p class="empty">Belum ada data user.</p>
            {:else}
              <ul class="top-users">
                {#each users.topActive as user (user.id)}
                  <li class="user-row">
                    <span class="avatar">{getInitials(user.displayName)}</span>
                    <div class="user-info">
                      <span class="user-name">{user.displayName}</span>
                      <span class="user-email">{user.email}</span>
                    </div>
                    <div class="user-badges">
                      {#if user.role === 'owner'}
                        <Badge tone="primary">owner</Badge>
                      {/if}
                      {#if user.telegramEnabled}
                        <Badge tone="success">telegram</Badge>
                      {:else}
                        <Badge tone="neutral">off</Badge>
                      {/if}
                    </div>
                    <div class="user-stats">
                      <span class="user-stat-value">{user.totalEmails}</span>
                      <span class="user-stat-label">email</span>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </CardSurface>
        </section>

        <section class="block">
          <header class="block-head">
            <div>
              <h3>System Health</h3>
              <p class="block-sub">Status worker, sesi login, dan kredensial aktif.</p>
            </div>
            <Badge tone={workerTone[system.worker]}>{workerLabel[system.worker]}</Badge>
          </header>
          <CardSurface>
            <div class="health-grid">
              <div class="health-row">
                <span class="health-label">Worker</span>
                <Badge tone={workerTone[system.worker]}>{workerLabel[system.worker]}</Badge>
              </div>
              <div class="health-row">
                <span class="health-label">Email masuk (1 jam)</span>
                <span class="health-value">{system.emailsLastHour}</span>
              </div>
              <div class="health-row">
                <span class="health-label">Login session aktif</span>
                <span class="health-value">{system.activeLoginSessions}</span>
              </div>
              <div class="health-row">
                <span class="health-label">API key aktif</span>
                <span class="health-value">{system.activeApiKeys}</span>
              </div>
              <div class="health-row">
                <span class="health-label">Access code menunggu</span>
                <span class="health-value">{system.pendingAccessCodes}</span>
              </div>
              <div class="health-row">
                <span class="health-label">Telegram update (24 jam)</span>
                <span class="health-value">{system.telegramUpdatesLast24h}</span>
              </div>
            </div>
            <div class="insights-divider"></div>
            <div class="health-footer">
              <Icon name="cloud_done" size={18} />
              <span>Health dicek kontinu via Cloudflare Worker.</span>
            </div>
          </CardSurface>
        </section>
      </div>

      <section class="block">
        <header class="block-head">
          <div>
            <h3>Recent Activity</h3>
            <p class="block-sub">5 aksi terakhir yang tercatat di audit log.</p>
          </div>
          <Badge tone="primary">{recentActivity.length} entri</Badge>
        </header>
        <CardSurface>
          {#if recentActivity.length === 0}
            <p class="empty">Belum ada aktivitas tercatat.</p>
          {:else}
            <ol class="activity-list">
              {#each recentActivity as entry (entry.id)}
                <li class="activity-row">
                  <span class="activity-icon activity-tone-{getActivityTone(entry.action)}">
                    <Icon name={getActivityIcon(entry.action)} size={16} />
                  </span>
                  <div class="activity-info">
                    <div class="activity-top">
                      <span class="activity-action">{entry.action || 'aksi'}</span>
                      {#if entry.fromState && entry.toState}
                        <span class="activity-states">
                          {entry.fromState} <span class="arrow">→</span> {entry.toState}
                        </span>
                      {/if}
                    </div>
                    <div class="activity-meta">
                      <span>oleh {entry.actor}</span>
                      <span>•</span>
                      <span>{formatRelative(entry.createdAt)}</span>
                    </div>
                  </div>
                </li>
              {/each}
            </ol>
          {/if}
        </CardSurface>
      </section>
    </div>
  </section>
</div>

<style>
  .main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6) var(--space-6) var(--space-6) var(--space-5);
    display: grid;
    gap: var(--space-5);
    align-content: start;
  }

  :global(.hero) {
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 92%) 0%,
        var(--color-surface-card) 100%
      );
  }

  :global([data-theme='dark']) :global(.hero) {
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-primary-700), var(--color-surface-card) 80%) 0%,
        var(--color-surface-card) 100%
      );
  }

  .hero-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    justify-content: space-between;
    align-items: center;
  }

  .hero-text {
    min-width: 0;
    flex: 1 1 18rem;
  }

  .hero-eyebrow {
    margin: 0 0 0.4rem;
    font-size: var(--font-size-label-sm);
    font-weight: 700;
    color: var(--color-primary-500);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  :global([data-theme='dark']) .hero-eyebrow {
    color: var(--color-primary-700);
  }

  .hero-title {
    margin: 0 0 0.35rem;
    font-size: clamp(1.35rem, 2.4vw, 1.75rem);
    line-height: 1.2;
  }

  .hero-sub {
    margin: 0;
    color: var(--color-text-muted);
    max-width: 48ch;
    line-height: 1.5;
  }

  .hero-sub strong {
    color: var(--color-text);
    font-weight: 700;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .block {
    display: grid;
    gap: var(--space-3);
  }

  .block-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .block-head h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .block-sub {
    margin: 0.15rem 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }

  :global(.kpi-card) {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    position: relative;
    overflow: hidden;
    padding: var(--space-4) var(--space-4) var(--space-4) calc(var(--space-4) + 4px);
  }

  :global(.kpi-card)::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 4px;
    background: var(--color-primary-500);
    opacity: 0.85;
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }

  :global(.kpi-card.tone-success)::before { background: var(--color-success); }
  :global(.kpi-card.tone-warning)::before { background: var(--color-warning); }
  :global(.kpi-card.tone-danger)::before { background: var(--color-danger); }
  :global(.kpi-card.tone-neutral)::before { background: var(--color-outline); }
  :global(.kpi-card.tone-primary)::before { background: var(--color-primary-500); }

  .kpi-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }

  .kpi-icon {
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 90%);
    color: var(--color-primary-500);
    border-radius: var(--radius-md);
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
  }

  :global(.kpi-card.tone-success) .kpi-icon {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success), var(--color-surface-card) 90%);
  }
  :global(.kpi-card.tone-warning) .kpi-icon {
    color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning), var(--color-surface-card) 90%);
  }
  :global(.kpi-card.tone-danger) .kpi-icon {
    color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger), var(--color-surface-card) 90%);
  }
  :global(.kpi-card.tone-neutral) .kpi-icon {
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-outline), var(--color-surface-card) 80%);
  }

  .kpi-value {
    font-size: 1.85rem;
    font-family: var(--font-family-headline);
    font-weight: 800;
    line-height: 1.1;
  }

  .kpi-label {
    color: var(--color-text);
    font-weight: 600;
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }

  .kpi-hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
    margin-top: 0.1rem;
  }

  .kpi-delta {
    margin-top: 0.3rem;
    color: var(--color-primary-500);
    font-size: var(--font-size-label-sm);
    font-weight: 700;
  }

  :global([data-theme='dark']) .kpi-delta {
    color: var(--color-primary-700);
  }

  .pipeline-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 70%);
  }

  .pipeline-stat {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .pipeline-stat-label {
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .pipeline-stat-value {
    font-family: var(--font-family-headline);
    font-size: 1.4rem;
    font-weight: 800;
  }

  .pipeline-bar {
    display: flex;
    width: 100%;
    height: 0.7rem;
    border-radius: var(--radius-pill);
    overflow: hidden;
    margin-top: var(--space-4);
    background: color-mix(in srgb, var(--color-outline), var(--color-surface-card) 75%);
  }

  .seg {
    display: block;
    height: 100%;
  }

  .seg-success { background: var(--color-success); }
  .seg-warning { background: var(--color-warning); }
  .seg-primary { background: var(--color-primary-500); }
  .seg-neutral { background: color-mix(in srgb, var(--color-outline), var(--color-text) 30%); }
  .seg-danger { background: var(--color-danger); }

  .seg-empty {
    flex: 1;
    display: grid;
    place-items: center;
    font-size: var(--font-size-label-sm);
    color: var(--color-text-muted);
  }

  .pipeline-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    margin-top: var(--space-3);
    justify-content: center;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: var(--font-size-label-sm);
  }

  .legend-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-success { background: var(--color-success); }
  .legend-warning { background: var(--color-warning); }
  .legend-primary { background: var(--color-primary-500); }
  .legend-neutral { background: color-mix(in srgb, var(--color-outline), var(--color-text) 30%); }
  .legend-danger { background: var(--color-danger); }

  .legend-label { color: var(--color-text-muted); }
  .legend-value { font-weight: 700; }
  .legend-pct { color: var(--color-text-muted); }

  .pipeline-progress {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .progress-row {
    display: grid;
    gap: 0.3rem;
  }

  .progress-meta {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-label-sm);
    color: var(--color-text-muted);
  }

  .progress-meta span:last-child {
    color: var(--color-text);
    font-weight: 700;
  }

  .progress-track {
    height: 0.4rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-outline), var(--color-surface-card) 75%);
    overflow: hidden;
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  .fill-warning { background: var(--color-warning); }
  .fill-primary { background: var(--color-primary-500); }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }

  .insights-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .insight-stat {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: var(--space-3);
    background: color-mix(in srgb, var(--color-surface-low), transparent 30%);
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 75%);
  }

  .insight-label {
    font-size: var(--font-size-label-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
  }

  .insight-value {
    font-family: var(--font-family-headline);
    font-size: 1.6rem;
    font-weight: 800;
  }

  .insights-divider {
    height: 1px;
    background: color-mix(in srgb, var(--color-outline), transparent 70%);
    margin: var(--space-4) 0;
  }

  .top-users-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .top-users-head span {
    font-weight: 700;
    color: var(--color-text);
  }

  .see-all {
    font-size: var(--font-size-label-sm);
    color: var(--color-primary-500);
    font-weight: 700;
  }

  :global([data-theme='dark']) .see-all {
    color: var(--color-primary-700);
  }

  .top-users {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .user-row {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto auto;
    gap: var(--space-3);
    align-items: center;
    padding: 0.55rem 0.6rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-low), transparent 40%);
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 80%);
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .user-row:hover {
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 95%);
    border-color: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 80%);
  }

  :global([data-theme='dark']) .user-row:hover {
    background: color-mix(in srgb, var(--color-primary-700), var(--color-surface-card) 90%);
    border-color: color-mix(in srgb, var(--color-primary-700), var(--color-surface-card) 70%);
  }

  .avatar {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--gradient-signature);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 0.78rem;
    font-family: var(--font-family-headline);
    flex-shrink: 0;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .user-name {
    font-weight: 700;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-email {
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-badges {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .user-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.05;
  }

  .user-stat-value {
    font-family: var(--font-family-headline);
    font-size: 1.1rem;
    font-weight: 800;
  }

  .user-stat-label {
    font-size: var(--font-size-label-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .health-grid {
    display: grid;
    gap: 0;
  }

  .health-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 78%);
  }

  .health-row:last-child {
    border-bottom: 0;
  }

  .health-label {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .health-value {
    font-family: var(--font-family-headline);
    font-size: 1.1rem;
    font-weight: 800;
  }

  .health-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
    padding-top: var(--space-3);
    border-top: 1px solid color-mix(in srgb, var(--color-outline), transparent 78%);
  }

  .health-footer :global(.icon) {
    color: var(--color-success);
  }

  .activity-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .activity-row {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: var(--space-3);
    align-items: flex-start;
    padding: 0.55rem 0.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 78%);
    transition: background-color 120ms ease;
  }

  .activity-row:last-child {
    border-bottom: 0;
  }

  .activity-row:hover {
    background: color-mix(in srgb, var(--color-surface-low), transparent 30%);
    border-radius: var(--radius-md);
  }

  .activity-icon {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 90%);
    color: var(--color-primary-500);
    flex-shrink: 0;
  }

  .activity-tone-success {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success), var(--color-surface-card) 90%);
  }
  .activity-tone-warning {
    color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning), var(--color-surface-card) 90%);
  }
  .activity-tone-danger {
    color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger), var(--color-surface-card) 90%);
  }
  .activity-tone-neutral {
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-outline), var(--color-surface-card) 80%);
  }
  .activity-tone-primary {
    color: var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 90%);
  }

  .activity-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .activity-top {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }

  .activity-action {
    font-weight: 700;
    text-transform: capitalize;
  }

  .activity-states {
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
  }

  .activity-states .arrow {
    color: var(--color-primary-500);
    margin: 0 0.2rem;
  }

  :global([data-theme='dark']) .activity-states .arrow {
    color: var(--color-primary-700);
  }

  .activity-meta {
    display: flex;
    gap: 0.4rem;
    color: var(--color-text-muted);
    font-size: var(--font-size-label-sm);
  }

  .empty {
    margin: 0;
    padding: var(--space-4) 0;
    text-align: center;
    color: var(--color-text-muted);
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-4) var(--space-4) var(--space-3);
      gap: var(--space-4);
    }

    .two-col {
      grid-template-columns: 1fr;
    }

    .hero-grid {
      align-items: flex-start;
      flex-direction: column;
    }

    .hero-actions {
      width: 100%;
    }

    .pipeline-summary {
      grid-template-columns: repeat(2, 1fr);
    }

    .user-row {
      grid-template-columns: 2rem minmax(0, 1fr) auto;
    }

    .user-stats {
      grid-column: 2 / 4;
      flex-direction: row;
      gap: 0.3rem;
      align-items: baseline;
    }
  }

  @media (max-width: 640px) {
    .kpi-grid {
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    .kpi-value {
      font-size: 1.5rem;
    }

    .pipeline-summary {
      grid-template-columns: 1fr 1fr;
    }

    .insights-grid {
      grid-template-columns: 1fr;
    }

    .user-row {
      grid-template-columns: 2rem minmax(0, 1fr);
    }

    .user-badges {
      grid-column: 2 / 3;
    }

    .user-stats {
      grid-column: 2 / 3;
    }

    .activity-row {
      grid-template-columns: 1.85rem minmax(0, 1fr);
    }
  }
</style>
