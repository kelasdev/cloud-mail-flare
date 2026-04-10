import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.sessionRole === 'owner') {
    throw redirect(307, '/dashboard');
  }

  if (locals.sessionUserId) {
    throw redirect(307, '/me/inbox');
  }

  throw redirect(307, '/auth/login');
};
