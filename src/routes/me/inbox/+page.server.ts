import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getUserById, getUserInbox } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  if (event.locals.sessionRole === 'owner') {
    throw redirect(303, '/dashboard');
  }

  const userId = event.locals.sessionUserId;
  if (!userId) {
    throw redirect(303, '/auth/login');
  }

  const [emails, currentUser] = await Promise.all([getUserInbox(event, userId), getUserById(event, userId)]);
  if (!currentUser) {
    throw error(404, 'User not found');
  }

  return {
    userId,
    currentUser,
    emails
  };
};
