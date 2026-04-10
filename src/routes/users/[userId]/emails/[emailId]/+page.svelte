<script lang="ts">
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import MailboxTopbar from '$lib/components/organisms/MailboxTopbar.svelte';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';
  import EmailBodyViewer from '$lib/components/molecules/EmailBodyViewer.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  $: email = data.email;
  $: receivedLabel = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '-';
  $: inboxHref = data.inboxOnly ? '/me/inbox' : `/users/${data.userId}/inbox`;
</script>

{#if data.inboxOnly}
  <section class="inbox-only-main">
    <MailboxTopbar
      userLabel={data.currentUser?.displayName ?? data.currentUser?.email ?? data.userId}
      showSearch={false}
      showRefresh={false}
    >
      <svelte:fragment slot="actions">
        <Button variant="secondary" href={inboxHref}>
          <Icon name="arrow_back" size={18} />
          Back to Inbox
        </Button>
      </svelte:fragment>
    </MailboxTopbar>
    <div class="content">
      <CardSurface>
        <div class="head">
          <div>
            <h2>{email.subject}</h2>
            <p class="text-muted">ID: {email.id}</p>
          </div>
          <div class="top-actions">
            <div class="badges">
              <Badge tone={email.isRead ? 'primary' : 'warning'}>{email.isRead ? 'Read' : 'Unread'}</Badge>
              {#if email.isStarred}
                <Badge tone="success">Starred</Badge>
              {/if}
            </div>
            <div class="icon-actions">
              <button class="icon-action" type="button" aria-label="Toggle star" title="Star">
                <Icon name={email.isStarred ? 'star' : 'star_border'} size={18} />
              </button>
              <button class="icon-action" type="button" aria-label="Archive email" title="Archive">
                <Icon name="archive" size={18} />
              </button>
              <button class="icon-action danger" type="button" aria-label="Delete email" title="Delete">
                <Icon name="delete" size={18} />
              </button>
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <div class="meta-label">From</div>
            <div class="meta-value">{email.sender}</div>
          </div>
          <div>
            <div class="meta-label">To</div>
            <div class="meta-value">{email.recipient}</div>
          </div>
          <div>
            <div class="meta-label">Received</div>
            <div class="meta-value">{receivedLabel}</div>
          </div>
        </div>

        <div class="body">
          <h3>Body</h3>
          <EmailBodyViewer bodyHtml={email.bodyHtml} bodyText={email.bodyText} snippet={email.snippet} />
        </div>
      </CardSurface>
    </div>
  </section>
{:else}
  <div class="layout-shell">
    <AppSidebar active="users" />
    <section class="main">
      <AppTopbar
        title={`Email - ${data.currentUser?.displayName ?? data.currentUser?.email ?? email.userId}`}
        breadcrumb="mailflare / users / emails / read"
        showMenuButton={false}
      >
        <svelte:fragment slot="actions">
          <Button variant="secondary" href={inboxHref}>
            <Icon name="arrow_back" size={18} />
            Back to Inbox
          </Button>
        </svelte:fragment>
      </AppTopbar>
      <div class="content">
        <CardSurface>
          <div class="head">
            <div>
              <h2>{email.subject}</h2>
              <p class="text-muted">ID: {email.id}</p>
            </div>
            <div class="top-actions">
              <div class="badges">
                <Badge tone={email.isRead ? 'primary' : 'warning'}>{email.isRead ? 'Read' : 'Unread'}</Badge>
                {#if email.isStarred}
                  <Badge tone="success">Starred</Badge>
                {/if}
              </div>
              <div class="icon-actions">
                <button class="icon-action" type="button" aria-label="Toggle star" title="Star">
                  <Icon name={email.isStarred ? 'star' : 'star_border'} size={18} />
                </button>
                <button class="icon-action" type="button" aria-label="Archive email" title="Archive">
                  <Icon name="archive" size={18} />
                </button>
                <button class="icon-action danger" type="button" aria-label="Delete email" title="Delete">
                  <Icon name="delete" size={18} />
                </button>
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div>
              <div class="meta-label">From</div>
              <div class="meta-value">{email.sender}</div>
            </div>
            <div>
              <div class="meta-label">To</div>
              <div class="meta-value">{email.recipient}</div>
            </div>
            <div>
              <div class="meta-label">Received</div>
              <div class="meta-value">{receivedLabel}</div>
            </div>
          </div>

          <div class="body">
            <h3>Body</h3>
            <EmailBodyViewer bodyHtml={email.bodyHtml} bodyText={email.bodyText} snippet={email.snippet} />
          </div>
        </CardSurface>
      </div>
    </section>
  </div>
{/if}

<style>
  .content {
    padding: var(--space-5);
  }

  .inbox-only-main {
    min-height: 100vh;
    width: 100%;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    margin-bottom: 0.2rem;
    line-height: 1.3;
  }

  .top-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .badges {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .icon-actions {
    display: inline-flex;
    align-items: center;
    background: var(--color-surface-low);
    padding: 0.25rem;
    border-radius: 0.6rem;
    gap: 0.2rem;
  }

  .icon-action {
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.4rem;
    border: 0;
    background: transparent;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 120ms ease;
  }

  .icon-action:hover {
    background: var(--color-surface-card);
    color: var(--color-primary-500);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--color-text), transparent 95%);
  }

  .icon-action.danger:hover {
    color: var(--color-danger);
  }

  .meta-grid {
    margin-top: var(--space-4);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-3);
  }

  .meta-label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }

  .meta-value {
    margin-top: 0.2rem;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .body {
    margin-top: var(--space-4);
  }

  h3 {
    margin-bottom: var(--space-2);
  }

  .inbox-only-main .content {
    max-width: 80rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-3);
    }

    .inbox-only-main .content {
      padding: var(--space-5) var(--space-3);
    }

    .head {
      flex-direction: column;
      align-items: flex-start;
    }

    .top-actions {
      align-items: flex-start;
      margin-top: var(--space-2);
    }

    .badges {
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }

</style>
