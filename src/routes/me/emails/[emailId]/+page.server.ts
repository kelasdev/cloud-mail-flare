import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserById, getUserEmailById } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  if (event.locals.sessionRole === 'owner') {
    throw redirect(303, '/dashboard');
  }

  const userId = event.locals.sessionUserId;
  if (!userId) {
    throw redirect(303, '/auth/login');
  }

  const [currentUser, email] = await Promise.all([
    getUserById(event, userId),
    getUserEmailById(event, userId, event.params.emailId)
  ]);
  if (!email) {
    throw error(404, 'Email not found');
  }

  return {
    currentUser,
    email
  };
};
