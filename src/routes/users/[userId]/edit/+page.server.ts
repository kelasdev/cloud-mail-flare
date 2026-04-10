import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserById } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  const user = await getUserById(event, event.params.userId);
  if (!user) {
    throw error(404, 'User not found');
  }

  return { user };
};
