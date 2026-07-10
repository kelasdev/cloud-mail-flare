<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/atoms/Button.svelte';
  import InputText from '$lib/components/atoms/InputText.svelte';
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
    if (typeof window !== 'undefined') {
      const tTimer = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(tTimer);
          (window as any).turnstile.render('#turnstile-widget', {
            sitekey: turnstileSiteKey,
            callback: function (token: string) {
              turnstileToken = token;
            }
          });
        }
      }, 200);
    }
  });

  async function handleSubmit() {
    if (isSubmitting) return;

    errorMessage = '';
    isSubmitting = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

<div class="login-page">
  <!-- Subtle grid pattern -->
  <div class="grid-bg" aria-hidden="true"></div>

  <!-- Glow effect -->
  <div class="glow" aria-hidden="true"></div>

  <div class="login-card">
    <!-- Header -->
    <header class="card-header">
      <div class="brand-row">
        <div class="brand-icon">
          <Icon name="cloud" size={20} />
        </div>
        <span class="brand-label">mailflare</span>
      </div>
    </header>

    <div class="divider"></div>

    <!-- Form -->
    <form class="form" on:submit|preventDefault={handleSubmit}>
      {#if showSetupTokenField}
        <div class="field">
          <label for="setupToken">
            <span class="field-icon"><Icon name="vpn_key" size={14} /></span>
            setup_token
          </label>
          <InputText
            id="setupToken"
            bind:value={setupToken}
            type="password"
            placeholder="required for first owner bootstrap"
          />
          <span class="field-meta">first-time only</span>
        </div>
      {/if}

      <div class="field">
        <label for="identifier">
          <span class="field-icon"><Icon name="person" size={14} /></span>
          identifier
        </label>
        <InputText
          id="identifier"
          bind:value={identifier}
          placeholder="name@company.com"
        />
      </div>

      <div class="field">
        <label for="password">
          <span class="field-icon"><Icon name="lock" size={14} /></span>
          password
        </label>
        <div class="password-wrap">
          <InputText
            id="password"
            bind:value={password}
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
          />
          <button
            class="toggle-pw"
            type="button"
            on:click={() => (showPassword = !showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={16} />
          </button>
        </div>
      </div>

      <div class="turnstile-wrap">
        <div id="turnstile-widget"></div>
      </div>

      {#if errorMessage}
        <div class="error" role="alert">
          <span class="error-dot"></span>
          <span class="error-text">{errorMessage}</span>
        </div>
      {/if}

      <button class="submit-btn" type="submit" disabled={isSubmitting}>
        <span class="submit-text">{isSubmitting ? 'authenticating...' : 'authenticate'}</span>
        <Icon name={isSubmitting ? 'hourglass_empty' : 'arrow_forward'} size={18} />
      </button>
    </form>

    <div class="divider"></div>

    <!-- Footer -->
    <footer class="card-footer">
      <a class="footer-link" href="/auth/access-code">
        <Icon name="vpn_key" size={14} />
        <span>use access code instead</span>
      </a>
    </footer>
  </div>

  <p class="version">v1.0.0 &middot; cloudflare workers</p>
</div>

<style>
  /* ── Page ──────────────────────────────────────────────────── */
  .login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #09090b;
    position: relative;
    overflow: hidden;
    padding: var(--space-6);
  }

  /* ── Grid Pattern ──────────────────────────────────────────── */
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 100%);
    pointer-events: none;
  }

  /* ── Glow ──────────────────────────────────────────────────── */
  .glow {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(circle, rgba(0,81,255,0.08) 0%, transparent 70%);
    pointer-events: none;
    filter: blur(80px);
  }

  /* ── Card ──────────────────────────────────────────────────── */
  .login-card {
    width: min(420px, 100%);
    background: #111113;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: var(--space-8);
    display: grid;
    gap: var(--space-6);
    position: relative;
    z-index: 1;
  }

  /* ── Header ────────────────────────────────────────────────── */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .brand-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 6px;
    background: var(--gradient-signature);
    color: #fff;
    display: grid;
    place-items: center;
  }

  .brand-label {
    font-family: var(--font-family-headline);
    font-size: 0.9375rem;
    font-weight: 700;
    color: #ededed;
    letter-spacing: -0.01em;
  }

  /* ── Divider ───────────────────────────────────────────────── */
  .divider {
    height: 1px;
    background: rgba(255,255,255,0.06);
  }

  /* ── Form ──────────────────────────────────────────────────── */
  .form {
    display: grid;
    gap: var(--space-5);
  }

  .field {
    display: grid;
    gap: 0.375rem;
  }

  .field label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.01em;
  }

  .field-icon {
    color: rgba(255,255,255,0.3);
    display: inline-flex;
    align-items: center;
  }

  .field-meta {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.625rem;
    color: rgba(255,255,255,0.25);
    font-style: italic;
  }

  /* ── Input Override ────────────────────────────────────────── */
  .form :global(.input) {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    color: #ededed;
    font-size: 0.875rem;
    padding: 0.6875rem 0.875rem;
    border-radius: 8px;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .form :global(.input::placeholder) {
    color: rgba(255,255,255,0.2);
  }

  .form :global(.input:focus) {
    border-color: rgba(0,81,255,0.5);
    box-shadow: 0 0 0 3px rgba(0,81,255,0.1);
    background: rgba(255,255,255,0.04);
  }

  /* ── Password Toggle ───────────────────────────────────────── */
  .password-wrap {
    position: relative;
  }

  .password-wrap :global(.input) {
    padding-right: 2.75rem;
  }

  .toggle-pw {
    position: absolute;
    right: 0.625rem;
    top: 50%;
    transform: translateY(-50%);
    border: 0;
    background: transparent;
    color: rgba(255,255,255,0.3);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    padding: 0.25rem;
    border-radius: 4px;
    transition: color 150ms ease;
  }

  .toggle-pw:hover {
    color: rgba(255,255,255,0.6);
  }

  /* ── Turnstile ─────────────────────────────────────────────── */
  .turnstile-wrap {
    display: flex;
    justify-content: center;
  }

  /* ── Error ─────────────────────────────────────────────────── */
  .error {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: 8px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.15);
  }

  .error-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
  }

  .error-text {
    font-size: 0.8125rem;
    color: #fca5a5;
  }

  /* ── Submit Button ─────────────────────────────────────────── */
  .submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: 8px;
    background: var(--gradient-signature);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: opacity 120ms ease, transform 120ms ease;
  }

  .submit-btn:hover {
    opacity: 0.92;
  }

  .submit-btn:active {
    transform: scale(0.98);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-text {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  /* ── Footer ────────────────────────────────────────────────── */
  .card-footer {
    display: flex;
    justify-content: center;
  }

  .footer-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.35);
    transition: color 150ms ease;
  }

  .footer-link:hover {
    color: rgba(255,255,255,0.6);
  }

  /* ── Version Tag ───────────────────────────────────────────── */
  .version {
    position: absolute;
    bottom: var(--space-6);
    left: 50%;
    transform: translateX(-50%);
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.625rem;
    color: rgba(255,255,255,0.15);
    letter-spacing: 0.05em;
  }

  /* ── Responsive ────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .login-card {
      padding: var(--space-6);
    }

    .card-header {
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
    }
  }
</style>
