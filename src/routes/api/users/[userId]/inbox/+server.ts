import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserInboxFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform, params }) => {
  const emails = await getUserInboxFromDb(platform?.env?.DB, params.userId);
  return json({ userId: params.userId, emails });
};
