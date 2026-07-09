<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import MailboxTopbar from '$lib/components/organisms/MailboxTopbar.svelte';
  import InboxTable from '$lib/components/organisms/InboxTable.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';
  import { page } from '$app/stores';
  import { sidebarCollapsed } from '$lib/stores/ui.store';
  import type { PageData } from './$types';

  export let data: PageData;
  $: adminEmail = $page.data.sessionEmail ?? null;

  let searchQuery = '';

  $: normalizedQuery = searchQuery.trim().toLowerCase();
  $: filteredEmails = data.search
    ? data.emails
    : normalizedQuery
      ? data.emails.filter((email) =>
          [email.sender, email.subject, email.snippet].some((field) => field.toLowerCase().includes(normalizedQuery))
        )
      : data.emails;
  $: unreadCount = data.emails.filter((email) => !email.isRead && !email.isArchived).length;
  $: starredCount = data.emails.filter((email) => email.isStarred && !email.isArchived).length;
  $: archivedCount = data.archivedCount ?? 0;
  $: inboxCount = Math.max(0, Number(data.currentUser?.totalEmails ?? data.emails.length) - archivedCount);

  $: activeQuery = data.search?.query ?? '';
  $: isSearching = data.search !== null;

  afterNavigate(({ to }) => {
    const next = to?.url.searchParams.get('q') ?? '';
    if (next !== searchQuery) {
      searchQuery = next;
    }
  });

  function buildHref(q: string): string {
    const trimmed = q.trim();
    const base = `/users/${data.userId}/inbox`;
    if (!trimmed) {
      return base;
    }
    return `${base}?q=${encodeURIComponent(trimmed.slice(0, 200))}`;
  }

  function handleSubmit() {
    void goto(buildHref(searchQuery), {
      replaceState: true,
      keepFocus: true,
      noScroll: true
    });
  }

  function handleClear() {
    searchQuery = '';
    void goto(buildHref(''), {
      replaceState: true,
      keepFocus: true,
      noScroll: true
    });
  }
</script>

{#if data.inboxOnly}
  <section class="inbox-only-main">
    <MailboxTopbar
      userLabel={data.currentUser?.displayName ?? data.currentUser?.email ?? data.userId}
      bind:searchQuery
      searchPlaceholder="Cari di subject, pengirim, atau body email..."
      onSearch={handleSubmit}
    />

    <div class="content">
      <div class="inbox-head">
        <div class="title-wrap">
          <h1>Inbox</h1>
          <span class="badge">{unreadCount} New</span>
        </div>
        {#if isSearching}
          <div class="search-indicator" role="status">
            <Icon name="search" size={16} />
            <span>
              Hasil untuk <strong>"{activeQuery}"</strong> &middot;
              {data.search?.resultCount ?? 0} email
            </span>
            <button type="button" class="clear-btn" on:click={handleClear} aria-label="Clear search">
              <Icon name="close" size={16} />
              <span>Reset</span>
            </button>
          </div>
        {/if}
      </div>

      {#if isSearching && filteredEmails.length === 0}
        <div class="empty-search">
          <Icon name="search_off" size={36} />
          <h3>Tidak ada email cocok</h3>
          <p class="text-muted">
            Coba kata kunci lain. Pencarian saat ini memindai subject, pengirim, penerima,
            snippet, dan body email.
          </p>
          <button type="button" class="reset-btn" on:click={handleClear}>
            <Icon name="arrow_back" size={16} />
            <span>Kembali ke inbox</span>
          </button>
        </div>
      {:else}
        <InboxTable
          userId={data.userId}
          emails={filteredEmails}
          emailHrefPrefix="/me/emails"
          mailboxOnly={true}
        />
      {/if}
    </div>

    <footer class="stats-footer">
      <div class="stats-grid">
        <div class="stat">
          <span>Total Inbox</span>
          <strong>{inboxCount}</strong>
        </div>
        <div class="separator" aria-hidden="true"></div>
        <div class="stat">
          <span>Total Starred</span>
          <strong>{starredCount}</strong>
        </div>
        <div class="separator" aria-hidden="true"></div>
        <div class="stat">
          <span>Total Archived</span>
          <strong>{archivedCount}</strong>
        </div>
      </div>
    </footer>
  </section>
{:else}
  <div class="layout-shell">
    <AppSidebar active="users" adminEmail={adminEmail} />
    <section class="main" class:sidebar-collapsed={$sidebarCollapsed}>
      <AppTopbar
        title="Inbox"
        variant="minimal"
        showRefresh={false}
        showLogout={false}
        showMenuButton={false}
      />
      <div class="content">
        <div class="inbox-head">
          {#if isSearching}
            <div class="search-indicator" role="status">
              <Icon name="search" size={16} />
              <span>
                Hasil untuk <strong>"{activeQuery}"</strong> &middot;
                {data.search?.resultCount ?? 0} email
              </span>
              <button type="button" class="clear-btn" on:click={handleClear} aria-label="Clear search">
                <Icon name="close" size={16} />
                <span>Reset</span>
              </button>
            </div>
          {/if}
        </div>

        {#if isSearching && filteredEmails.length === 0}
          <div class="empty-search">
            <Icon name="search_off" size={36} />
            <h3>Tidak ada email cocok</h3>
            <p class="text-muted">
              Coba kata kunci lain. Pencarian saat ini memindai subject, pengirim, penerima,
              snippet, dan body email.
            </p>
            <button type="button" class="reset-btn" on:click={handleClear}>
              <Icon name="arrow_back" size={16} />
              <span>Kembali ke inbox</span>
            </button>
          </div>
        {:else}
          <InboxTable
            userId={data.userId}
            emails={filteredEmails}
            emailHrefPrefix={`/users/${data.userId}/emails`}
            mailboxOnly={true}
          />
        {/if}
      </div>
      <footer class="stats-footer dashboard-footer">
        <div class="stats-grid">
          <div class="stat">
            <span>Total Inbox</span>
            <strong>{inboxCount}</strong>
          </div>
          <div class="separator" aria-hidden="true"></div>
          <div class="stat">
            <span>Total Starred</span>
            <strong>{starredCount}</strong>
          </div>
          <div class="separator" aria-hidden="true"></div>
          <div class="stat">
            <span>Total Archived</span>
            <strong>{archivedCount}</strong>
          </div>
        </div>
      </footer>
    </section>
  </div>
{/if}

<style>
  .main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .content {
    padding: var(--space-5);
  }

  .main .content {
    flex: 1;
  }

  .inbox-only-main {
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .inbox-only-main .content {
    max-width: 80rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
    display: grid;
    gap: var(--space-5);
  }

  .inbox-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .title-wrap {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .title-wrap h1 {
    font-size: 1.8rem;
    line-height: 1.2;
  }

  .badge {
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-primary-500), transparent 88%);
    color: var(--color-primary-500);
    padding: 0.3rem 0.62rem;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .search-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem 0.6rem 0.45rem 0.85rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 92%);
    color: var(--color-primary-500);
    font-size: 0.82rem;
    font-weight: 600;
    flex-wrap: wrap;
  }

  .search-indicator strong {
    color: var(--color-text);
    font-weight: 700;
  }

  .clear-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--color-primary-500), transparent 60%);
    background: transparent;
    color: var(--color-primary-500);
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .clear-btn:hover {
    background: color-mix(in srgb, var(--color-primary-500), var(--color-surface-card) 80%);
  }

  .empty-search {
    display: grid;
    place-items: center;
    gap: 0.6rem;
    text-align: center;
    padding: var(--space-8) var(--space-4);
    border: 1px dashed color-mix(in srgb, var(--color-outline), transparent 55%);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
  }

  .empty-search h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--color-text);
  }

  .empty-search p {
    margin: 0;
    max-width: 38ch;
  }

  .reset-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 0;
    background: var(--gradient-signature);
    color: #fff;
    font-weight: 700;
    font-size: 0.85rem;
    padding: 0.55rem 1rem;
    border-radius: var(--radius-pill);
    cursor: pointer;
    margin-top: 0.4rem;
  }

  .stats-footer {
    border-top: 1px solid color-mix(in srgb, var(--color-outline), transparent 76%);
    padding: var(--space-5) var(--space-3);
  }

  .inbox-only-main .stats-footer {
    margin-top: auto;
  }

  .dashboard-footer {
    margin-top: 0;
  }

  .stats-grid {
    max-width: 80rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
  }

  .stat {
    text-align: center;
  }

  .stat span {
    display: block;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-muted);
    margin-bottom: 0.35rem;
    font-weight: 700;
  }

  .stat strong {
    font-family: var(--font-family-headline);
    font-size: 1.45rem;
  }

  .separator {
    width: 1px;
    height: 2.2rem;
    background: color-mix(in srgb, var(--color-outline), transparent 70%);
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-3);
    }

    .inbox-only-main .content {
      padding: var(--space-5) var(--space-3);
      gap: var(--space-4);
    }

    .title-wrap h1 {
      font-size: 1.45rem;
    }

    .stats-footer {
      padding: var(--space-4) var(--space-3);
    }

    .stats-grid {
      gap: var(--space-3);
      width: 100%;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .separator {
      display: none;
    }

    .stat strong {
      font-size: 1.2rem;
    }
  }
</style>
