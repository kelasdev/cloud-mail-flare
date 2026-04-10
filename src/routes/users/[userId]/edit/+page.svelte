<script lang="ts">
  import { goto } from '$app/navigation';
  import AppSidebar from '$lib/components/organisms/AppSidebar.svelte';
  import AppTopbar from '$lib/components/organisms/AppTopbar.svelte';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import InputText from '$lib/components/atoms/InputText.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let email = data.user.email;
  let displayName = data.user.displayName;
  let password = '';
  let confirmPassword = '';
  let isSubmitting = false;
  let isDeleting = false;
  let errorMessage = '';

  async function handleSave() {
    if (isSubmitting || isDeleting) {
      return;
    }

    isSubmitting = true;
    errorMessage = '';

    if (password && password.length < 8) {
      errorMessage = 'Password minimal 8 karakter.';
      isSubmitting = false;
      return;
    }
    if (password && password !== confirmPassword) {
      errorMessage = 'Konfirmasi password tidak sama.';
      isSubmitting = false;
      return;
    }

    try {
      const response = await fetch(`/api/users/${data.user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          displayName,
          ...(password ? { password } : {})
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        errorMessage = payload?.error ?? 'Failed to update user.';
        return;
      }

      await goto('/users');
    } catch {
      errorMessage = 'Unable to reach server. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDelete() {
    if (isDeleting || isSubmitting) {
      return;
    }

    if (!confirm(`Delete user ${data.user.email}? This action cannot be undone.`)) {
      return;
    }

    isDeleting = true;
    errorMessage = '';

    try {
      const response = await fetch(`/api/users/${data.user.id}`, {
        method: 'DELETE',
        headers: {
          'x-mailflare-confirm': 'delete-user'
        }
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              dependencies?: { emails?: number; loginSessions?: number };
            }
          | null;

        if (payload?.dependencies) {
          errorMessage = `${payload.error ?? 'Delete blocked'} (emails: ${payload.dependencies.emails ?? 0}, sessions: ${payload.dependencies.loginSessions ?? 0})`;
        } else {
          errorMessage = payload?.error ?? 'Failed to delete user.';
        }
        return;
      }

      await goto('/users');
    } catch {
      errorMessage = 'Unable to reach server. Please try again.';
    } finally {
      isDeleting = false;
    }
  }
</script>

<div class="layout-shell">
  <AppSidebar active="users" />
  <section class="main">
    <AppTopbar title="Edit User" breadcrumb="mailflare / users / edit" showSearch={false} showMenuButton={false} />
    <div class="content">
      <CardSurface>
        <div class="panel">
          <div>
            <h2>Edit User</h2>
            <p class="text-muted">Update user identity and email address.</p>
          </div>

          <form class="form" on:submit|preventDefault={handleSave}>
            <div>
              <label for="display-name">Display Name</label>
              <InputText id="display-name" bind:value={displayName} required />
            </div>

            <div>
              <label for="email">Email</label>
              <InputText id="email" type="email" bind:value={email} required />
            </div>
            <div>
              <label for="password">New Password (Optional)</label>
              <InputText id="password" type="password" bind:value={password} placeholder="Kosongkan jika tidak diubah" />
            </div>
            <div>
              <label for="confirm-password">Confirm New Password</label>
              <InputText id="confirm-password" type="password" bind:value={confirmPassword} placeholder="Ulangi password baru" />
            </div>

            {#if errorMessage}
              <p class="error">{errorMessage}</p>
            {/if}

            <div class="actions">
              <Button href="/users" variant="ghost">Cancel</Button>
              <Button type="button" variant="secondary" disabled={isDeleting || isSubmitting} on:click={handleDelete}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button type="submit" disabled={isSubmitting || isDeleting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
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
  }

  .panel {
    display: grid;
    gap: var(--space-5);
    max-width: 42rem;
  }

  h2 {
    font-size: 1.35rem;
    margin-bottom: 0.3rem;
  }

  .form {
    display: grid;
    gap: var(--space-4);
  }

  label {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .error {
    color: #c1263c;
    font-size: 0.85rem;
  }

  @media (max-width: 960px) {
    .content {
      padding: var(--space-4) var(--space-3);
    }

    .actions {
      flex-wrap: wrap;
      justify-content: stretch;
    }

    .actions :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
