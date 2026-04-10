import type { PageServerLoad } from './$types';
import { getWorkerSettings } from '$lib/server/services/worker-settings.service';

export const load: PageServerLoad = async (event) => {
  const workerSettings = await getWorkerSettings(event);
  return { workerSettings };
};
