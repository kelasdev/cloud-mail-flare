import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getUserArchivedEmailCount, getUserById, getUserInbox } from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  const userId = event.params.userId;
  const isOwner = event.locals.sessionRole === 'owner';
  const sessionUserId = event.locals.sessionUserId;

  if (!isOwner && sessionUserId && userId !== sessionUserId) {
    throw redirect(303, '/me/inbox');
  }

  const [emails, currentUser, archivedCount] = await Promise.all([
    getUserInbox(event, userId),
    getUserById(event, userId),
    getUserArchivedEmailCount(event, userId)
  ]);
  if (!currentUser) {
    throw error(404, 'User not found');
  }

  return {
    userId,
    currentUser,
    emails,
    archivedCount,
    inboxOnly: !isOwner
  };
};
