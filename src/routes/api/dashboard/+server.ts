import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDashboardMetrics } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform }) => {
  const dashboard = await getDashboardMetrics(platform?.env?.DB);
  return json(dashboard);
};
