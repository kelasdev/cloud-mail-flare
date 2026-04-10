import type { RequestEvent } from '@sveltejs/kit';
import type { DashboardDto } from '$lib/types/dto';
import { getDashboardMetrics } from '$lib/server/db';

export async function getDashboard(event: RequestEvent): Promise<DashboardDto> {
  return getDashboardMetrics(event.platform?.env?.DB);
}
