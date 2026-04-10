import type { RequestEvent } from '@sveltejs/kit';
import type { WorkerSettingsDto } from '$lib/types/dto';
import { getWorkerSettingsFromDb } from '$lib/server/db';
import { getTelegramWebhookInfo } from '$lib/server/telegram';

export interface WorkerSettingsPageDto {
  settings: WorkerSettingsDto;
  webhook: {
    connected: boolean;
    url: string;
    ipAddress: string;
    maxConnections: number;
    pendingUpdates: number;
    allowedUpdates: string[];
    lastErrorAt: string;
    lastErrorMessage: string;
    source: 'live' | 'settings';
  };
}

export async function getWorkerSettings(event: RequestEvent): Promise<WorkerSettingsPageDto> {
  const settings = await getWorkerSettingsFromDb(event.platform?.env?.DB);
  const envTokenConfigured = Boolean(event.platform?.env?.TELEGRAM_BOT_TOKEN?.trim());
  const mergedSettings = {
    ...settings.settings,
    botTokenConfigured: settings.settings.botTokenConfigured || envTokenConfigured,
    botStatus: settings.settings.botTokenConfigured || envTokenConfigured ? 'Configured' : 'Missing Token'
  };

  try {
    const liveWebhook = await getTelegramWebhookInfo(event.platform?.env?.DB, event.platform?.env);
    if (!liveWebhook) {
      return {
        ...settings,
        settings: mergedSettings,
        webhook: {
          ...settings.webhook,
          source: 'settings'
        }
      };
    }

    return {
      ...settings,
      settings: mergedSettings,
      webhook: {
        connected: liveWebhook.connected,
        url: liveWebhook.url || settings.webhook.url,
        ipAddress: liveWebhook.ipAddress || settings.webhook.ipAddress,
        maxConnections: liveWebhook.maxConnections || settings.webhook.maxConnections,
        pendingUpdates: liveWebhook.pendingUpdates,
        allowedUpdates: liveWebhook.allowedUpdates.length > 0 ? liveWebhook.allowedUpdates : settings.webhook.allowedUpdates,
        lastErrorAt: liveWebhook.lastErrorAt,
        lastErrorMessage: liveWebhook.lastErrorMessage,
        source: 'live'
      }
    };
  } catch {
    return {
      ...settings,
      settings: mergedSettings,
      webhook: {
        ...settings.webhook,
        source: 'settings'
      }
    };
  }
}
