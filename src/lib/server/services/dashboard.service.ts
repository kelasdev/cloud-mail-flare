import type { RequestEvent } from '@sveltejs/kit';
import type { DashboardDto } from '$lib/types/dto';
import { getDashboardOverview } from '$lib/server/db';

export async function getDashboard(event: RequestEvent): Promise<DashboardDto> {
  return getDashboardOverview(event.platform?.env?.DB);
}
