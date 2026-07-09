import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  return {
    sessionRole: locals.sessionRole ?? null,
    sessionEmail: locals.sessionEmail ?? null
  };
};
