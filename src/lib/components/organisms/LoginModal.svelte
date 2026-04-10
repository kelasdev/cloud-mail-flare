<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/atoms/Button.svelte';
  import InputText from '$lib/components/atoms/InputText.svelte';
  import BrandLockup from '$lib/components/molecules/BrandLockup.svelte';
  import Icon from '$lib/components/atoms/Icon.svelte';

  let identifier = '';
  let password = '';
  let setupToken = '';
  let errorMessage = '';
  let isSubmitting = false;
  let showPassword = false;
  let turnstileToken = '';

  export let turnstileSiteKey: string;
  export let showSetupTokenField = false;

  onMount(() => {
    // Memuat script dengan Svelte-kit tidak terblokir
    if (typeof window !== 'undefined') {
      // Pastikan ada instance render dan script akan memanggil callback on_cf_load jika diperlukan
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

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    errorMessage = '';
    isSubmitting = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier,
          password,
          setupToken: showSetupTokenField ? setupToken : '',
          turnstileToken
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        errorMessage = payload?.error ?? 'Login failed.';
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
    <h2>Login</h2>
    <p class="text-muted">Secure infrastructure access for your mail system.</p>
    <form class="form" on:submit|preventDefault={handleSubmit}>
      <div class="field">
        <label for="identifier">Email or Username</label>
        <div class="input-wrap">
          <span class="field-icon"><Icon name="person" size={20} /></span>
          <InputText id="identifier" bind:value={identifier} placeholder="name@infrastructure.com" />
        </div>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <div class="input-wrap">
          <span class="field-icon"><Icon name="lock" size={20} /></span>
          <InputText id="password" bind:value={password} type={showPassword ? 'text' : 'password'} placeholder="********" />
          <button
            class="toggle-password"
            type="button"
            on:click={() => (showPassword = !showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        </div>
      </div>
      {#if showSetupTokenField}
        <div class="field">
          <label for="setupToken">Setup Token (First Login Only)</label>
          <div class="input-wrap">
            <span class="field-icon"><Icon name="vpn_key" size={20} /></span>
            <InputText
              id="setupToken"
              bind:value={setupToken}
              type="password"
              placeholder="Wajib diisi untuk bootstrap owner pertama"
            />
          </div>
        </div>
      {/if}
      <div class="field turnstile-container">
        <div id="turnstile-widget"></div>
      </div>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
      <Button type="submit" fullWidth disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Login'}</Button>
    </form>
    <a class="alt" href="/auth/access-code">
      <Icon name="vpn_key" size={18} />
      <span>Masuk dengan Access Code</span>
    </a>
  </section>
</div>

<style>
  .overlay {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--space-6);
    background: color-mix(in srgb, var(--color-text), transparent 70%);
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

  .field {
    display: grid;
    gap: 0.35rem;
  }

  .input-wrap {
    position: relative;
  }

  .field-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    display: inline-flex;
    pointer-events: none;
    z-index: 1;
  }

  .input-wrap :global(.input) {
    padding-left: 2.5rem;
    padding-right: 2.5rem;
  }

  .toggle-password {
    position: absolute;
    right: 0.65rem;
    top: 50%;
    transform: translateY(-50%);
    border: 0;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem;
  }

  .toggle-password:hover {
    color: var(--color-primary-500);
  }

  .alt {
    margin-top: var(--space-3);
    color: var(--color-primary-500);
    font-weight: 600;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .error {
    color: #c1263c;
    font-size: 0.85rem;
    margin-top: -0.2rem;
  }
</style>
