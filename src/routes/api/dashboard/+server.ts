import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDashboardOverview } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform }) => {
  const dashboard = await getDashboardOverview(platform?.env?.DB);
  return json(dashboard);
};
