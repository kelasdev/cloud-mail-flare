import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserById, getUserEmailById } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  const { userId, emailId } = event.params;
  const isOwner = event.locals.sessionRole === 'owner';
  const sessionUserId = event.locals.sessionUserId;

  if (!isOwner && sessionUserId && userId !== sessionUserId) {
    throw redirect(303, '/me/inbox');
  }

  const [currentUser, email] = await Promise.all([getUserById(event, userId), getUserEmailById(event, userId, emailId)]);
  if (!email) {
    throw error(404, 'Email not found');
  }

  return {
    userId,
    currentUser,
    email,
    inboxOnly: !isOwner
  };
};
