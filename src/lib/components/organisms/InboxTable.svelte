<script lang="ts">
  import type { EmailDto } from '$lib/types/dto';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import Checkbox from '$lib/components/atoms/Checkbox.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  export let emails: EmailDto[] = [];
  export let userId = '';
  export let emailHrefPrefix = '';
  export let mailboxOnly = false;

  $: rowHrefPrefix = emailHrefPrefix || `/users/${userId}/emails`;
  $: starredCount = emails.filter((email) => email.isStarred).length;
  $: unreadCount = emails.filter((email) => !email.isRead).length;

  type InboxTab = 'primary' | 'starred' | 'unread';
  let activeTab: InboxTab = 'primary';

  $: visibleEmails =
    activeTab === 'starred'
      ? emails.filter((email) => email.isStarred)
      : activeTab === 'unread'
        ? emails.filter((email) => !email.isRead)
        : emails;

  function initials(sender: string): string {
    const plain = sender.replace(/["<>]/g, ' ').trim();
    const parts = plain.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'EM';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function timeLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';

    const now = new Date();
    const sameDay =
      now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate();

    if (sameDay) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }
</script>

<CardSurface className={mailboxOnly ? 'mailbox-card' : ''}>
  {#if !mailboxOnly}
    <div class="header">
      <h2>Inbox</h2>
      <Badge tone="primary">{emails.length} messages</Badge>
    </div>
  {:else}
    <div class="mailbox-filter">
      <div class="tabs">
        <button type="button" class={`tab ${activeTab === 'primary' ? 'active' : ''}`} on:click={() => (activeTab = 'primary')}>
          Primary <span>{emails.length}</span>
        </button>
        <button type="button" class={`tab ${activeTab === 'starred' ? 'active' : ''}`} on:click={() => (activeTab = 'starred')}>
          Starred <span>{starredCount}</span>
        </button>
        <button type="button" class={`tab ${activeTab === 'unread' ? 'active' : ''}`} on:click={() => (activeTab = 'unread')}>
          Unread <span>{unreadCount}</span>
        </button>
      </div>
      <div class="pager">
        <button type="button" aria-label="Previous page">
          <Icon name="chevron_left" size={18} />
        </button>
        <button type="button" aria-label="Next page">
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
    </div>
  {/if}

  <div class="table">
    {#if mailboxOnly}
      {#if visibleEmails.length === 0}
        <div class="empty">No emails in this filter.</div>
      {:else}
        {#each visibleEmails as email (email.id)}
          <a href={`${rowHrefPrefix}/${email.id}`} class={`mailbox-row ${email.isRead ? 'read' : 'unread'}`}>
            <div class="mailbox-left">
              <Icon name={email.isStarred ? 'star' : 'star_outline'} size={18} />
              <span class="avatar">{initials(email.sender)}</span>
              <span class="sender">{email.sender}</span>
            </div>
            <div class="summary">
              <span class="subject">{email.subject}</span>
              <span class="snippet">{email.snippet}</span>
            </div>
            <div class="time">{timeLabel(email.receivedAt)}</div>
          </a>
        {/each}
      {/if}
    {:else}
      {#each emails as email (email.id)}
        <a href={`${rowHrefPrefix}/${email.id}`} class={`row ${email.isRead ? 'read' : 'unread'}`}>
          <div class="select"><Checkbox /></div>
          <div class="star">
            <Icon name={email.isStarred ? 'star' : 'star_outline'} size={18} />
          </div>
          <div class="sender">{email.sender}</div>
          <div class="subject">{email.subject}</div>
          <div class="snippet">{email.snippet}</div>
          <div class="time">{new Date(email.receivedAt).toLocaleString()}</div>
        </a>
      {/each}
    {/if}
  </div>
</CardSurface>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  h2 {
    font-size: 1.5rem;
  }

  .table {
    display: grid;
    gap: 0.5rem;
  }

  .mailbox-card {
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .mailbox-filter {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid color-mix(in srgb, var(--color-outline), transparent 72%);
    background: color-mix(in srgb, var(--color-surface-low), transparent 12%);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .tab {
    border: 0;
    border-radius: var(--radius-pill);
    padding: 0.4rem 0.7rem;
    background: transparent;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .tab span {
    border-radius: var(--radius-pill);
    min-width: 1.2rem;
    padding: 0 0.35rem;
    background: color-mix(in srgb, var(--color-outline), transparent 78%);
  }

  .tab.active {
    color: var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500), transparent 90%);
  }

  .pager {
    display: inline-flex;
    gap: var(--space-2);
  }

  .pager button {
    border: 0;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.5rem;
    color: var(--color-text-muted);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mailbox-row {
    display: grid;
    grid-template-columns: minmax(200px, 320px) minmax(220px, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 76%);
    border-radius: var(--radius-md);
    padding: 0.72rem 0.85rem;
    background: var(--color-surface-card);
  }

  .mailbox-row:hover {
    border-color: color-mix(in srgb, var(--color-primary-500), transparent 65%);
    background: color-mix(in srgb, var(--color-primary-500), transparent 96%);
  }

  .mailbox-left {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .avatar {
    width: 1.95rem;
    height: 1.95rem;
    border-radius: var(--radius-pill);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-primary-500), transparent 82%);
    color: var(--color-primary-500);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .summary {
    min-width: 0;
    display: inline-flex;
    gap: var(--space-2);
  }

  .summary .subject {
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 700;
  }

  .summary .snippet {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    border-radius: var(--radius-md);
    border: 1px dashed color-mix(in srgb, var(--color-outline), transparent 55%);
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
  }

  .row {
    display: grid;
    grid-template-columns: 1.5rem 1.5rem minmax(140px, 220px) minmax(220px, 1fr) 1.2fr minmax(120px, 180px);
    gap: 0.7rem;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 70%);
    border-radius: var(--radius-md);
    padding: 0.6rem 0.8rem;
    background: var(--color-surface-card);
  }

  .row:hover {
    border-color: color-mix(in srgb, var(--color-primary-500), transparent 65%);
  }

  .unread .subject {
    font-weight: 700;
  }

  .read {
    opacity: 0.8;
  }

  .sender,
  .snippet,
  .subject,
  .time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snippet,
  .time {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .row .time,
  .mailbox-row .time {
    text-align: right;
    color: var(--color-text-muted);
    font-size: 0.78rem;
  }

  @media (max-width: 960px) {
    .mailbox-filter {
      margin-left: calc(var(--space-3) * -1);
      margin-right: calc(var(--space-3) * -1);
      padding: var(--space-2_5) var(--space-3);
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .tabs {
      gap: 0.35rem;
      overflow-x: auto;
      flex-wrap: nowrap;
      width: 100%;
      padding-bottom: 0.1rem;
      scrollbar-width: thin;
    }

    .tab {
      flex: 0 0 auto;
    }

    .pager {
      margin-left: auto;
    }

    .mailbox-row {
      grid-template-columns: 1fr;
      gap: 0.35rem;
    }

    .mailbox-left {
      width: 100%;
    }

    .mailbox-left .sender {
      min-width: 0;
      flex: 1;
    }

    .summary {
      display: block;
      width: 100%;
    }

    .summary .subject,
    .summary .snippet {
      max-width: none;
      display: block;
    }

    .summary .snippet {
      margin-top: 0.18rem;
    }

    .mailbox-row .time {
      text-align: left;
    }

    .row {
      grid-template-columns: 1.5rem 1.5rem 1fr;
    }

    .subject,
    .snippet,
    .time {
      display: none;
    }
  }
</style>
