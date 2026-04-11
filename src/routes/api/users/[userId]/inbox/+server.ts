import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserArchivedEmailCountFromDb, getUserInboxFromDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform, params }) => {
  const [emails, archivedCount] = await Promise.all([
    getUserInboxFromDb(platform?.env?.DB, params.userId),
    getUserArchivedEmailCountFromDb(platform?.env?.DB, params.userId)
  ]);
  return json({ userId: params.userId, emails, archivedCount });
};
