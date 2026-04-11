<script lang="ts">
  import MailboxTopbar from '$lib/components/organisms/MailboxTopbar.svelte';
  import InboxTable from '$lib/components/organisms/InboxTable.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';

  $: normalizedQuery = searchQuery.trim().toLowerCase();
  $: filteredEmails = normalizedQuery
    ? data.emails.filter((email) =>
        [email.sender, email.subject, email.snippet].some((field) => field.toLowerCase().includes(normalizedQuery))
      )
    : data.emails;
  $: unreadCount = data.emails.filter((email) => !email.isRead).length;
  $: starredCount = data.emails.filter((email) => email.isStarred).length;
  $: archivedCount = data.archivedCount ?? 0;
</script>

<section class="inbox-only-main">
  <MailboxTopbar
    userLabel={data.currentUser.displayName}
    bind:searchQuery
    searchPlaceholder="Search sender, subject, or snippet..."
  />

  <div class="content">
    <div class="inbox-head">
      <div class="title-wrap">
        <h1>Inbox</h1>
        <span class="badge">{unreadCount} New</span>
      </div>
    </div>

    <InboxTable userId={data.userId} emails={filteredEmails} emailHrefPrefix="/me/emails" mailboxOnly={true} />
  </div>

  <footer class="stats-footer">
    <div class="stats-grid">
      <div class="stat">
        <span>Total Inbox</span>
        <strong>{data.emails.length}</strong>
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

<style>
  .content {
    max-width: 80rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
    display: grid;
    gap: var(--space-5);
  }

  .inbox-only-main {
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .inbox-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .title-wrap {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  h1 {
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

  .stats-footer {
    margin-top: auto;
    border-top: 1px solid color-mix(in srgb, var(--color-outline), transparent 76%);
    padding: var(--space-5) var(--space-3);
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
      padding: var(--space-5) var(--space-3);
      gap: var(--space-4);
    }

    h1 {
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
