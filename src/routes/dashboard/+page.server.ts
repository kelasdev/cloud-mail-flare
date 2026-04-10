import type { PageServerLoad } from './$types';
import { getDashboard } from '$lib/server/services/dashboard.service';

export const load: PageServerLoad = async (event) => {
  const dashboard = await getDashboard(event);
  return { dashboard };
};
