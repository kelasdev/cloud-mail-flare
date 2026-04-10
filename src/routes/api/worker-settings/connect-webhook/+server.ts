import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { connectTelegramWebhook } from '$lib/server/telegram';

export const POST: RequestHandler = async ({ platform, locals, url }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const webhookUrl = new URL('/api/telegram/webhook', url.origin).toString();

  try {
    const result = await connectTelegramWebhook(platform?.env?.DB, platform?.env, webhookUrl);
    if (!result.ok) {
      return json(
        {
          ok: false,
          error: result.message,
          payload: {
            message: result.message,
            webhook: result.webhook
              ? {
                  ...result.webhook,
                  source: 'live' as const
                }
              : null
          }
        },
        { status: 400 }
      );
    }

    return json({
      ok: true,
      payload: {
        message: result.message,
        webhook: result.webhook
          ? {
              ...result.webhook,
              source: 'live' as const
            }
          : null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: `Failed to connect Telegram webhook: ${message}` }, { status: 500 });
  }
};
