import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  getUserArchivedEmailCount,
  getUserById,
  getUserInbox,
  searchUserInbox
} from '$lib/server/services/users.service';

export const load: PageServerLoad = async (event) => {
  const userId = event.params.userId;
  const isOwner = event.locals.sessionRole === 'owner';
  const sessionUserId = event.locals.sessionUserId;

  if (!isOwner && sessionUserId && userId !== sessionUserId) {
    throw redirect(303, '/me/inbox');
  }

  const rawQuery = (event.url.searchParams.get('q') ?? '').slice(0, 200);
  const isSearching = rawQuery.trim().length > 0;

  const [emailSource, currentUser, archivedCount, searchMeta] = await Promise.all([
    isSearching ? Promise.resolve([]) : getUserInbox(event, userId),
    getUserById(event, userId),
    getUserArchivedEmailCount(event, userId),
    isSearching ? searchUserInbox(event, userId, rawQuery) : Promise.resolve(null)
  ]);

  if (!currentUser) {
    throw error(404, 'User not found');
  }

  const emails = isSearching && searchMeta ? searchMeta.items : emailSource;

  return {
    userId,
    currentUser,
    emails,
    archivedCount,
    inboxOnly: !isOwner,
    search: isSearching
      ? {
          query: rawQuery,
          resultCount: emails.length,
          limit: 200
        }
      : null
  };
};
