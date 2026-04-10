<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { UserDto } from '$lib/types/dto';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import Avatar from '$lib/components/atoms/Avatar.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';
  import InputText from '$lib/components/atoms/InputText.svelte';

  export let users: UserDto[] = [];

  const dispatch = createEventDispatcher<{ usercreated: void; userchanged: void }>();

  let modalOpen = false;
  let username = '';
  let isSubmitting = false;
  let actionUserId = '';
  let errorMessage = '';
  let copyMessage = '';
  let listMessage = '';
  let credentialContext: 'create' | 'reset' = 'create';
  let generatedCredentials: {
    username: string;
    email: string;
    password: string;
  } | null = null;

  function formatCount(value: number | undefined) {
    return Number(value ?? 0).toLocaleString();
  }

  function openModal() {
    modalOpen = true;
    resetForm();
  }

  function closeModal() {
    if (isSubmitting) {
      return;
    }
    modalOpen = false;
    resetForm();
  }

  function resetForm() {
    username = '';
    errorMessage = '';
    copyMessage = '';
    generatedCredentials = null;
    credentialContext = 'create';
  }

  async function handleCreateUser() {
    if (isSubmitting) {
      return;
    }

    errorMessage = '';
    isSubmitting = true;

    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      errorMessage = 'Username wajib diisi.';
      isSubmitting = false;
      return;
    }
    if (normalized.length < 3 || normalized.length > 64) {
      errorMessage = 'Username harus 3-64 karakter.';
      isSubmitting = false;
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(normalized)) {
      errorMessage = 'Username hanya boleh a-z, 0-9, titik, underscore, dan hyphen.';
      isSubmitting = false;
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: normalized
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            credentials?: {
              username: string;
              email: string;
              password: string;
            };
          }
        | null;
      if (!response.ok) {
        errorMessage = payload?.error ?? 'Failed to create user.';
        return;
      }

      if (!payload?.credentials) {
        errorMessage = 'Create user succeeded but credentials payload is missing.';
        return;
      }

      generatedCredentials = payload.credentials;
      credentialContext = 'create';
      username = '';
      dispatch('usercreated');
      dispatch('userchanged');
    } catch {
      errorMessage = 'Unable to reach server. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }

  async function copyValue(label: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copyMessage = `${label} copied.`;
    } catch {
      copyMessage = 'Failed to copy. Please copy manually.';
    }
  }

  async function handleQuickCopyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      listMessage = 'Email copied.';
    } catch {
      listMessage = 'Failed to copy email.';
    }
  }

  async function handleQuickResetPassword(user: UserDto) {
    if (isSubmitting || actionUserId) {
      return;
    }
    if (!confirm(`Reset password untuk ${user.email}?`)) {
      return;
    }

    errorMessage = '';
    listMessage = '';
    actionUserId = user.id;

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resetPassword: true })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; password?: string } | null;

      if (!response.ok || !payload?.password) {
        listMessage = payload?.error ?? 'Failed to reset password.';
        return;
      }

      generatedCredentials = {
        username: user.displayName,
        email: user.email,
        password: payload.password
      };
      copyMessage = '';
      credentialContext = 'reset';
      modalOpen = true;
      dispatch('userchanged');
    } catch {
      listMessage = 'Unable to reach server. Please try again.';
    } finally {
      actionUserId = '';
    }
  }

  async function handleQuickSoftDelete(user: UserDto) {
    if (isSubmitting || actionUserId) {
      return;
    }
    if (user.role === 'owner') {
      listMessage = 'Owner account tidak bisa di-soft delete.';
      return;
    }
    if (!confirm(`Soft delete user ${user.email}? User akan dinonaktifkan.`)) {
      return;
    }

    errorMessage = '';
    listMessage = '';
    actionUserId = user.id;

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'x-mailflare-confirm': 'soft-delete-user'
        }
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        listMessage = payload?.error ?? 'Failed to soft delete user.';
        return;
      }

      listMessage = `${user.email} disabled.`;
      dispatch('userchanged');
    } catch {
      listMessage = 'Unable to reach server. Please try again.';
    } finally {
      actionUserId = '';
    }
  }
</script>

<CardSurface>
  <div class="panel-header">
    <div>
      <h2>User Management</h2>
      <p class="text-muted">Directory of all infrastructure collaborators and access roles.</p>
    </div>
    <Button on:click={openModal}>
      <Icon name="person_add" size={18} />
      Add User
    </Button>
  </div>
  {#if listMessage}
    <p class="text-muted list-feedback">{listMessage}</p>
  {/if}

  {#if users.length === 0}
    <div class="empty">
      <Icon name="person_off" size={38} />
      <h3>Belum ada user.</h3>
      <p class="text-muted">Mulai kelola tim Anda dengan menambahkan user pertama.</p>
    </div>
  {:else}
    <div class="list">
      {#each users as user (user.id)}
        <div class="row">
          <a href={`/users/${user.id}/inbox`} class="identity-link">
            <Avatar initials={user.displayName.slice(0, 2).toUpperCase()} />
            <div>
              <div class="name">{user.displayName}</div>
              <div class="text-muted">{user.email}</div>
              <div class="text-muted identity-metrics">
                <span>Email: {formatCount(user.totalEmails)}</span>
                <span>Unread: {formatCount(user.unreadEmails)}</span>
              </div>
            </div>
          </a>
          <div class="meta">
            <Badge tone={user.status === 'active' ? 'success' : 'neutral'}>{user.status}</Badge>
            <span class="role">{user.role}</span>
            <div class="quick-actions">
              <button class="icon-action" type="button" aria-label="Copy email" title="Copy email" on:click={() => handleQuickCopyEmail(user.email)}>
                <Icon name="content_copy" size={16} />
              </button>
              <button
                class="icon-action"
                type="button"
                aria-label="Reset password"
                title="Reset password"
                disabled={actionUserId === user.id || user.status !== 'active'}
                on:click={() => handleQuickResetPassword(user)}
              >
                <Icon name="lock_reset" size={16} />
              </button>
              <button
                class="icon-action danger"
                type="button"
                aria-label="Soft delete user"
                title="Soft delete user"
                disabled={actionUserId === user.id || user.role === 'owner' || user.status !== 'active'}
                on:click={() => handleQuickSoftDelete(user)}
              >
                <Icon name="person_remove" size={16} />
              </button>
            </div>
            <Button href={`/users/${user.id}/edit`} variant="ghost">Edit</Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</CardSurface>

{#if modalOpen}
  <button class="modal-backdrop" type="button" aria-label="Close add user modal" on:click={closeModal}></button>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
    <div class={`modal-card ${generatedCredentials ? 'modal-success' : ''}`}>
      {#if generatedCredentials}
        <div class="top-accent"></div>
      {:else}
        <div class="modal-head">
          <h3 id="add-user-title">Add New User</h3>
          <p class="text-muted">Grant infrastructure access to a new team member.</p>
        </div>
      {/if}

      {#if generatedCredentials}
        <div class="modal-body credentials-pane">
          <div class="success-head">
            <div class="success-icon-wrap">
              <Icon name="check_circle" size={36} />
            </div>
            <h3 class="success-title">Success!</h3>
            {#if credentialContext === 'create'}
              <p class="text-muted success-subtitle">The new team member has been successfully added to your infrastructure.</p>
            {:else}
              <p class="text-muted success-subtitle">Password has been reset. Save and share the new credential securely.</p>
            {/if}
          </div>

          <div class="credential-list">
            <div class="credential-item">
              <span class="credential-label">Email</span>
              <div class="credential-row">
                <code>{generatedCredentials.email}</code>
                <button
                  class="copy-btn"
                  type="button"
                  on:click={() => generatedCredentials && copyValue('Email', generatedCredentials.email)}
                >
                  <Icon name="content_copy" size={18} />
                </button>
              </div>
            </div>
            <div class="credential-item">
              <span class="credential-label">Password</span>
              <div class="credential-row">
                <code>{generatedCredentials.password}</code>
                <button
                  class="copy-btn"
                  type="button"
                  on:click={() => generatedCredentials && copyValue('Password', generatedCredentials.password)}
                >
                  <Icon name="content_copy" size={18} />
                </button>
              </div>
            </div>
          </div>

          <div class="warning-box">
            <div class="warning-icon">
              <Icon name="warning" size={18} />
            </div>
            <p>
              <strong>Make sure to save this password securely.</strong> It will not be shown again for security reasons.
            </p>
          </div>

          {#if copyMessage}
            <p class="text-muted copy-feedback">{copyMessage}</p>
          {/if}

          <div class="modal-footer success-footer">
            <button class="btn-submit signature-bg done-btn" type="button" on:click={closeModal}>Done</button>
          </div>
        </div>
      {:else}
        <form class="modal-body modal-form" on:submit|preventDefault={handleCreateUser}>
          <div class="field">
            <label for="add-user-username">Username</label>
            <div class="input-shell">
              <InputText id="add-user-username" bind:value={username} placeholder="e.g. alex" required />
              <span class="input-icon">
                <Icon name="alternate_email" size={16} />
              </span>
            </div>
            <p class="hint text-muted">Email dan password akan dibuat otomatis secara aman sesuai domain yang ditentukan.</p>
          </div>

          {#if errorMessage}
            <p class="error">{errorMessage}</p>
          {/if}

          <div class="modal-footer">
            <button class="btn-cancel" type="button" disabled={isSubmitting} on:click={closeModal}>Cancel</button>
            <button class="btn-submit signature-bg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Add User'}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    align-items: center;
    margin-bottom: var(--space-5);
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
  }

  .list-feedback {
    margin: 0 0 var(--space-3);
    font-size: 0.84rem;
  }

  .list {
    display: grid;
    gap: 0.55rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 70%);
    border-radius: var(--radius-md);
    padding: 0.75rem 0.85rem;
    background: color-mix(in srgb, var(--color-surface-low), var(--color-surface-card) 50%);
  }

  .row:hover {
    border-color: color-mix(in srgb, var(--color-primary-500), transparent 65%);
    background: var(--color-surface-card);
  }

  .identity-link {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    flex: 1;
    color: inherit;
    text-decoration: none;
  }

  .name {
    font-weight: 700;
  }

  .identity-metrics {
    margin-top: 0.22rem;
    display: inline-flex;
    gap: 0.8rem;
    font-size: 0.78rem;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .quick-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .icon-action {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 55%);
    background: color-mix(in srgb, var(--color-surface-low), white 25%);
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-action:hover {
    color: var(--color-primary-500);
    border-color: color-mix(in srgb, var(--color-primary-500), transparent 55%);
  }

  .icon-action.danger:hover {
    color: #bf273f;
    border-color: color-mix(in srgb, #bf273f, transparent 55%);
  }

  .icon-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .role {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-label-xs);
    color: var(--color-text-muted);
    font-weight: 700;
  }

  .empty {
    min-height: 15rem;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.6rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    background: color-mix(in srgb, var(--color-text), transparent 60%);
    backdrop-filter: blur(2px);
    z-index: 20;
  }

  .modal {
    position: fixed;
    inset: 0;
    z-index: 21;
    display: grid;
    place-items: center;
    padding: var(--space-5);
  }

  .modal-card {
    width: min(28rem, 100%);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 75%);
    background: var(--color-surface-card);
    box-shadow: var(--shadow-modal);
    overflow: hidden;
  }

  .modal-success {
    width: min(32rem, 100%);
  }

  .top-accent {
    height: 0.38rem;
    width: 100%;
    background: var(--gradient-signature);
  }

  .modal-head {
    padding: var(--space-8) var(--space-8) var(--space-4);
  }

  h3 {
    font-size: 1.55rem;
    margin-bottom: 0.3rem;
    letter-spacing: -0.02em;
  }

  .modal-body {
    padding: var(--space-6) var(--space-8);
  }

  .modal-form {
    display: grid;
    gap: var(--space-4);
  }

  .credentials-pane {
    display: grid;
    gap: var(--space-4);
    padding-top: var(--space-8);
  }

  .success-head {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.45rem;
    margin-bottom: var(--space-2);
  }

  .success-icon-wrap {
    width: 4rem;
    height: 4rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--color-primary-500), white 85%);
    color: var(--color-primary-500);
    display: grid;
    place-items: center;
  }

  .success-title {
    font-size: 2rem;
    line-height: 1.1;
    margin: 0;
  }

  .success-subtitle {
    max-width: 22rem;
    margin: 0;
    font-size: 0.96rem;
  }

  .field {
    display: grid;
    gap: var(--space-2);
  }

  label {
    display: block;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }

  .input-shell {
    position: relative;
  }

  .input-icon {
    position: absolute;
    right: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    color: color-mix(in srgb, var(--color-text-muted), transparent 40%);
    pointer-events: none;
  }

  .input-shell :global(.input) {
    border: 0;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--color-surface-low), white 35%);
    padding-top: 0.9rem;
    padding-bottom: 0.9rem;
    padding-right: 2.5rem;
  }

  .input-shell :global(.input):focus {
    background: var(--color-surface-card);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-8) var(--space-8);
  }

  .btn-cancel {
    border: 0;
    background: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-family-headline);
    font-weight: 800;
    font-size: 0.78rem;
    border-radius: 0.75rem;
    padding: 0.75rem 1.5rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: color-mix(in srgb, var(--color-surface-low), transparent 35%);
  }

  .btn-submit {
    border: 0;
    color: #fff;
    font-family: var(--font-family-headline);
    font-weight: 800;
    font-size: 0.78rem;
    border-radius: 0.75rem;
    padding: 0.75rem 2rem;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(0, 81, 255, 0.2);
  }

  .btn-submit:disabled,
  .btn-cancel:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .hint {
    margin-top: 0;
    font-size: 0.8rem;
  }

  .credential-list {
    display: grid;
    gap: var(--space-3);
  }

  .credential-item {
    display: grid;
    gap: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 60%);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-low), white 35%);
    padding: 0.7rem 0.85rem;
  }

  .credential-label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }

  .credential-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  code {
    font-size: 0.85rem;
    font-family: 'Consolas', 'Courier New', monospace;
    color: var(--color-primary-500);
    overflow-wrap: anywhere;
  }

  .copy-btn {
    border: 0;
    background: transparent;
    color: var(--color-primary-500);
    border-radius: 0.5rem;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: color-mix(in srgb, var(--color-primary-500), white 88%);
  }

  .warning-box {
    margin-top: var(--space-2);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--color-warning), white 88%);
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .warning-box p {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: color-mix(in srgb, var(--color-warning), #402000 30%);
  }

  .warning-icon {
    color: var(--color-warning);
    margin-top: 0.1rem;
  }

  .copy-feedback {
    font-size: 0.8rem;
    margin: 0;
  }

  .success-footer {
    padding-top: var(--space-2);
  }

  .done-btn {
    width: 100%;
    font-size: 1rem;
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }

  .error {
    color: #c1263c;
    font-size: 0.85rem;
  }

  @media (max-width: 960px) {
    .panel-header {
      flex-direction: column;
      align-items: stretch;
      margin-bottom: var(--space-4);
    }

    .row {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-3);
      padding: 0.75rem;
    }

    .identity-link {
      align-items: flex-start;
    }

    .identity-metrics {
      flex-wrap: wrap;
      gap: 0.45rem 0.8rem;
    }

    .meta {
      width: 100%;
      flex-wrap: wrap;
      justify-content: space-between;
      row-gap: var(--space-2);
    }

    .quick-actions {
      order: 3;
    }

    .modal {
      align-items: end;
      padding: 0;
    }

    .modal-card,
    .modal-success {
      width: 100%;
      border-radius: 1rem 1rem 0 0;
      max-height: 92vh;
      overflow: auto;
    }

    .modal-head,
    .modal-body,
    .modal-footer {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }

    .modal-head {
      padding-top: var(--space-5);
    }

    .modal-body {
      padding-bottom: var(--space-4);
    }

    .modal-footer {
      padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
      flex-wrap: wrap;
      justify-content: stretch;
    }

    .modal-footer :global(.btn),
    .btn-submit,
    .btn-cancel {
      width: 100%;
    }

    .credential-row {
      align-items: flex-start;
    }
  }
</style>
