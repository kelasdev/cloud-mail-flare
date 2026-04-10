import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionByToken, SESSION_COOKIE_NAME } from '$lib/server/session';

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_app/')) {
    return true;
  }
  if (pathname.startsWith('/auth/')) {
    return true;
  }

  return (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/access-code' ||
    pathname === '/api/health' ||
    pathname === '/api/telegram/webhook' ||
    pathname === '/api/telegram/notify-email'
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const token = event.cookies.get(SESSION_COOKIE_NAME) ?? '';
  const db = event.platform?.env?.DB;

  event.locals.authenticated = false;
  event.locals.sessionUserId = undefined;
  event.locals.sessionEmail = undefined;
  event.locals.sessionRole = undefined;

  if (token && db) {
    const session = await getSessionByToken(db, token);
    if (session) {
      event.locals.authenticated = true;
      event.locals.sessionUserId = session.userId;
      event.locals.sessionEmail = session.email;
      event.locals.sessionRole = session.role;
    } else {
      event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    }
  } else if (token && !db) {
    event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  }

  if (!event.locals.authenticated && !isPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'content-type': 'application/json'
        }
      });
    }

    throw redirect(303, '/auth/login');
  }

  if (event.locals.authenticated && event.locals.sessionRole !== 'owner') {
    const ownInboxPath = '/me/inbox';
    const ownEmailPrefix = '/me/emails/';

    const isOwnInboxPage = pathname === ownInboxPath;
    const isOwnEmailPage = pathname.startsWith(ownEmailPrefix);
    const isAllowedPage = isOwnInboxPage || isOwnEmailPage;

    if (pathname.startsWith('/api/')) {
      const isAllowedApi =
        pathname === '/api/auth/logout' ||
        pathname === '/api/auth/access-code' ||
        pathname === '/api/health' ||
        pathname === '/api/me' ||
        pathname === '/api/me/inbox' ||
        pathname.startsWith('/api/me/emails/');

      if (!isAllowedApi) {
        return new Response(JSON.stringify({ error: 'Forbidden: inbox-only account' }), {
          status: 403,
          headers: {
            'content-type': 'application/json'
          }
        });
      }
    } else if (!isPublicPath(pathname) && !isAllowedPage) {
      throw redirect(303, ownInboxPath);
    }
  }

  return resolve(event);
};
