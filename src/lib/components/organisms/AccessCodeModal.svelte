<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/atoms/Button.svelte';
  import InputText from '$lib/components/atoms/InputText.svelte';
  import BrandLockup from '$lib/components/molecules/BrandLockup.svelte';

  let accessCode = '';
  let errorMessage = '';
  let isSubmitting = false;
  let turnstileToken = '';

  export let turnstileSiteKey: string;

  onMount(() => {
    if (typeof window !== 'undefined') {
      const tTimer = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(tTimer);
          (window as any).turnstile.render('#turnstile-widget', {
            sitekey: turnstileSiteKey,
            callback: function(token: string) {
              turnstileToken = token;
            }
          });
        }
      }, 200);
    }
  });

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    errorMessage = '';
    isSubmitting = true;

    try {
      const response = await fetch('/api/auth/access-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          code: accessCode,
          turnstileToken
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        errorMessage = payload?.error ?? 'Access code login failed.';
        return;
      }

      await goto('/dashboard');
    } catch {
      errorMessage = 'Unable to reach server. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</svelte:head>

<div class="overlay">
  <section class="modal">
    <BrandLockup />
    <h2>Access Code</h2>
    <p class="text-muted">Masukkan one-time access code dari perangkat admin.</p>
    <form class="form" on:submit|preventDefault={handleSubmit}>
      <div>
        <label for="access_code">One-time Access Code</label>
        <InputText id="access_code" bind:value={accessCode} placeholder="MF-XXXX-XXXX-XXXX" />
      </div>
      <div class="field turnstile-container">
        <div id="turnstile-widget"></div>
      </div>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
      <Button type="submit" fullWidth disabled={isSubmitting}>{isSubmitting ? 'Unlocking...' : 'Unlock'}</Button>
    </form>
    <a class="alt" href="/auth/login">Masuk dengan Username & Password</a>
  </section>
</div>

<style>
  .overlay {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--space-6);
    background: color-mix(in srgb, var(--color-text), transparent 75%);
    backdrop-filter: blur(6px);
  }

  .modal {
    width: min(440px, 100%);
    padding: var(--space-8);
    border-radius: var(--radius-lg);
    background: var(--color-surface-card);
    box-shadow: var(--shadow-modal);
    display: grid;
    gap: var(--space-3);
  }

  h2 {
    font-size: 1.6rem;
  }

  .form {
    margin-top: var(--space-2);
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

  .alt {
    margin-top: var(--space-3);
    color: var(--color-primary-500);
    font-weight: 600;
    font-size: 0.85rem;
  }

  .error {
    color: #c1263c;
    font-size: 0.85rem;
    margin-top: -0.2rem;
  }
</style>
