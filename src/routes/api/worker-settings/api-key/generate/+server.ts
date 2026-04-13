import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateApiKeyIfAbsent } from '$lib/server/api-key';
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
    const result = await generateApiKeyIfAbsent(platform?.env?.DB, {
      createdBy,
      name: 'worker-settings'
    });

    if (!result.ok) {
      return json(
        {
          ok: false,
          error: 'Active API key already exists',
          payload: {
            hasActiveKey: true,
            activeKey: result.activeKey
          }
        },
        { status: 409 }
      );
    }

    await sendApiKeyIssuedTelegramNotification(platform?.env?.DB, platform?.env, {
      apiKey: result.issued.apiKey,
      action: 'generated',
      createdBy,
      source: 'admin-web'
    }).catch(() => 0);

    return json({
      ok: true,
      payload: {
        apiKey: result.issued.apiKey,
        activeKey: result.issued.activeKey
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }
    return json({ error: 'Failed to generate API key' }, { status: 500 });
  }
};
