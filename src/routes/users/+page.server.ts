import type { PageServerLoad } from './$types';
import { getUsers } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  const users = await getUsers(event);
  return { users };
};
