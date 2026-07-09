import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDashboardOverview } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform, locals }) => {
  if (!locals.authenticated || locals.sessionRole !== 'owner') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  const dashboard = await getDashboardOverview(platform?.env?.DB);
  return json(dashboard);
};
