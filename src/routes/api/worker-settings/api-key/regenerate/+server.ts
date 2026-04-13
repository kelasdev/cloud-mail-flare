import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { regenerateApiKey } from '$lib/server/api-key';
import { sendApiKeyIssuedTelegramNotification } from '$lib/server/telegram';

export const POST: RequestHandler = async ({ locals, platform }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (locals.sessionRole !== 'owner') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const createdBy = `web:${locals.sessionEmail ?? 'owner'}`;
    const issued = await regenerateApiKey(platform?.env?.DB, {
      createdBy,
      name: 'worker-settings'
    });

    await sendApiKeyIssuedTelegramNotification(platform?.env?.DB, platform?.env, {
      apiKey: issued.apiKey,
      action: 'regenerated',
      createdBy,
      source: 'admin-web'
    }).catch(() => 0);

    return json({
      ok: true,
      payload: {
        apiKey: issued.apiKey,
        activeKey: issued.activeKey
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }
    return json({ error: 'Failed to regenerate API key' }, { status: 500 });
  }
};
