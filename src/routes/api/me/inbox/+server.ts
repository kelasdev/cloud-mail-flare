import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserInboxFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, platform }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const emails = await getUserInboxFromDb(platform?.env?.DB, userId);
  return json({ userId, emails });
};
