import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendTelegramTestConnection } from '$lib/server/telegram';

export const POST: RequestHandler = async ({ platform, locals }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendTelegramTestConnection(platform?.env?.DB, platform?.env);
    if (!result.ok) {
      return json(
        {
          ok: false,
          error: result.message,
          payload: {
            ...result,
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
        ...result,
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
    return json({ ok: false, error: `Failed to test Telegram connection: ${message}` }, { status: 500 });
  }
};
