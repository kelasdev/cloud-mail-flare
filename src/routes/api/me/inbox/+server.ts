import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserArchivedEmailCountFromDb, getUserInboxFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, platform }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [emails, archivedCount] = await Promise.all([
    getUserInboxFromDb(platform?.env?.DB, userId),
    getUserArchivedEmailCountFromDb(platform?.env?.DB, userId)
  ]);
  return json({ userId, emails, archivedCount });
};
