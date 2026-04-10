import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByIdFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, platform }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUserByIdFromDb(platform?.env?.DB, userId);
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  return json({ user });
};
