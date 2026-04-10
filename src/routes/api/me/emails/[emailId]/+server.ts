import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEmailByIdFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = await getEmailByIdFromDb(platform?.env?.DB, userId, params.emailId);
  if (!email) {
    return json({ error: 'Email not found' }, { status: 404 });
  }

  return json({ email });
};
