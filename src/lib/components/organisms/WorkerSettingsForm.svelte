<script lang="ts">
  import type { WorkerSettingsDto } from '$lib/types/dto';
  import type { WorkerSettingsPageDto } from '$lib/server/services/worker-settings.service';
  import CardSurface from '$lib/components/atoms/CardSurface.svelte';
  import Button from '$lib/components/atoms/Button.svelte';
  import FieldLabelInput from '$lib/components/molecules/FieldLabelInput.svelte';
  import Badge from '$lib/components/atoms/Badge.svelte';
  import Checkbox from '$lib/components/atoms/Checkbox.svelte';

  export let data: WorkerSettingsPageDto;

  let settings: WorkerSettingsDto = { ...data.settings };
  let botTokenInput = '';
  let webhookSecretInput = '';
  let saveMessage = '';
  let saveError = '';
  let saving = false;
  let testingConnection = false;
  let connectingWebhook = false;

  async function saveSettings(): Promise<void> {
    saving = true;
    saveMessage = '';
    saveError = '';

    try {
      const response = await fetch('/api/worker-settings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          ...(botTokenInput.trim() ? { botToken: botTokenInput.trim() } : {}),
          ...(webhookSecretInput.trim() ? { webhookSecret: webhookSecretInput.trim() } : {}),
          allowedIds: settings.allowedIds.trim(),
          forwardInbound: settings.forwardInbound,
          targetMode: settings.targetMode.trim(),
          defaultChatId: settings.defaultChatId.trim(),
          testChatId: settings.testChatId.trim()
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            payload?: WorkerSettingsPageDto;
          }
        | null;
      if (!response.ok || !payload?.ok || !payload.payload) {
        throw new Error(payload?.error ?? 'Failed to save settings');
      }

      settings = { ...payload.payload.settings };
      data = payload.payload;
      botTokenInput = '';
      webhookSecretInput = '';
      saveMessage = 'Telegram config saved';
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Failed to save settings';
    } finally {
      saving = false;
    }
  }

  async function testConnection(): Promise<void> {
    if (testingConnection) {
      return;
    }

    testingConnection = true;
    saveMessage = '';
    saveError = '';

    try {
      const response = await fetch('/api/worker-settings/test-telegram', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            payload?: {
              message?: string;
              targetChatId?: string;
              webhook?: WorkerSettingsPageDto['webhook'] | null;
            };
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.payload) {
        throw new Error(payload?.error ?? 'Failed to send test connection');
      }

      if (payload.payload.webhook) {
        data = {
          ...data,
          webhook: {
            ...data.webhook,
            ...payload.payload.webhook
          }
        };
      }

      const syntheticEmailId = `test-notify-${Date.now()}`;
      const notifyResponse = await fetch('/api/telegram/notify-email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          emailId: syntheticEmailId,
          sender: 'worker-settings-test@mailflare.local',
          recipient: 'admin@mailflare.local',
          subject: '[TEST] notify-email from worker settings',
          skipPersist: true,
          snippet:
            'Synthetic inbound email notification from Worker Settings test button. Inline actions should appear in Telegram.'
        })
      });

      const notifyPayload = (await notifyResponse.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            sentTo?: number;
          }
        | null;
      if (!notifyResponse.ok || !notifyPayload?.ok) {
        throw new Error(notifyPayload?.error ?? 'Failed to send test notify-email');
      }

      saveMessage = `${payload.payload.message ?? 'Test connection sent'}${payload.payload.targetChatId ? ` (${payload.payload.targetChatId})` : ''}. notify-email sent to ${notifyPayload.sentTo ?? 0} chat(s), emailId=${syntheticEmailId}`;
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Failed to send test connection';
    } finally {
      testingConnection = false;
    }
  }

  async function connectWebhook(): Promise<void> {
    if (connectingWebhook) {
      return;
    }

    connectingWebhook = true;
    saveMessage = '';
    saveError = '';

    try {
      const response = await fetch('/api/worker-settings/connect-webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            payload?: {
              message?: string;
              webhook?: WorkerSettingsPageDto['webhook'] | null;
            };
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.payload) {
        throw new Error(payload?.error ?? 'Failed to connect webhook');
      }

      if (payload.payload.webhook) {
        data = {
          ...data,
          webhook: {
            ...data.webhook,
            ...payload.payload.webhook
          }
        };
      }

      saveMessage = payload.payload.message ?? 'Webhook connected';
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Failed to connect webhook';
    } finally {
      connectingWebhook = false;
    }
  }
</script>

<div class="wrap">
  <CardSurface>
    <h2>Telegram Bot Config</h2>
    <p class="text-muted">Forward inbound email and test delivery target.</p>
    <form class="fields" on:submit|preventDefault={saveSettings}>
      <FieldLabelInput label="Bot Status" value={settings.botStatus} readonly />
      <FieldLabelInput
        label="Bot Token (optional update)"
        bind:value={botTokenInput}
        placeholder={settings.botTokenConfigured ? 'Configured (leave empty to keep)' : 'Paste bot token'}
        type="password"
      />
      <FieldLabelInput
        label="Webhook Secret (optional update)"
        bind:value={webhookSecretInput}
        placeholder={settings.webhookSecretConfigured ? 'Configured (leave empty to keep)' : 'Optional secret token'}
        type="password"
      />
      <FieldLabelInput label="Allowed IDs (DB)" bind:value={settings.allowedIds} />
      <FieldLabelInput label="Target Mode" bind:value={settings.targetMode} />
      <label class="toggle">
        <Checkbox bind:checked={settings.forwardInbound} />
        <span>Forward inbound email to Telegram</span>
      </label>
      <FieldLabelInput label="Default Chat ID" bind:value={settings.defaultChatId} placeholder="Fallback chat id" />
      <FieldLabelInput label="Test Chat ID" bind:value={settings.testChatId} placeholder="Temporary test target" />
      <div class="actions">
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Telegram Config'}</Button>
        <Button type="button" variant="secondary" on:click={testConnection} disabled={testingConnection}>
          {testingConnection ? 'Testing...' : 'Test Connection'}
        </Button>
      </div>
      {#if saveMessage}
        <p class="feedback success">{saveMessage}</p>
      {/if}
      {#if saveError}
        <p class="feedback error">{saveError}</p>
      {/if}
    </form>
  </CardSurface>

  <CardSurface>
    <h2>Webhook Status</h2>
    <div class="webhook-grid">
      <div>
        <div class="label">Pending Updates</div>
        <div class="value">{data.webhook.pendingUpdates}</div>
      </div>
      <div>
        <div class="label">IP Address</div>
        <div class="value">{data.webhook.ipAddress}</div>
      </div>
      <div>
        <div class="label">Max Connections</div>
        <div class="value">{data.webhook.maxConnections}</div>
      </div>
      <div>
        <div class="label">Allowed Updates</div>
        <div class="value">{data.webhook.allowedUpdates.join(', ')}</div>
      </div>
    </div>
    <div class="url">
      <div class="label">Webhook URL</div>
      <code>{data.webhook.url}</code>
    </div>
    {#if data.webhook.lastErrorMessage}
      <p class="feedback error">Last Telegram error: {data.webhook.lastErrorMessage}</p>
      {#if data.webhook.lastErrorAt}
        <p class="feedback error">At: {data.webhook.lastErrorAt}</p>
      {/if}
    {/if}
    <div class="footer">
      {#if data.webhook.connected}
        <Badge tone="success">Connected ({data.webhook.source})</Badge>
      {:else}
        <Button type="button" on:click={connectWebhook} disabled={connectingWebhook || saving || testingConnection}>
          {connectingWebhook ? 'Connecting...' : 'Connect Webhook Telegram'}
        </Button>
      {/if}
    </div>
  </CardSurface>
</div>

<style>
  .wrap {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--space-5);
  }

  h2 {
    font-size: 1.2rem;
    margin-bottom: 0.2rem;
  }

  .fields {
    margin-top: var(--space-4);
    display: grid;
    gap: var(--space-3);
  }

  .actions {
    margin-top: var(--space-2);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .feedback {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .feedback.success {
    color: #0f7b3d;
  }

  .feedback.error {
    color: #bb1f2f;
  }

  .webhook-grid {
    margin-top: var(--space-4);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: var(--font-size-label-xs);
    font-weight: 700;
  }

  .value {
    margin-top: 0.25rem;
    font-weight: 600;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .url {
    margin-top: var(--space-4);
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 65%);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  code {
    display: block;
    margin-top: 0.4rem;
    font-size: 0.78rem;
    color: var(--color-primary-500);
    overflow-wrap: anywhere;
  }

  .footer {
    margin-top: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  @media (max-width: 960px) {
    .wrap {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .actions {
      grid-template-columns: 1fr;
    }

    .webhook-grid {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }
  }
</style>
