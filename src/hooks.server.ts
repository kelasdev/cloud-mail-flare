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
    pathname === '/api/telegram/notify-email' ||
    pathname.startsWith('/api/public/v1/')
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
        headers: { 'content-type': 'application/json' }
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
          headers: { 'content-type': 'application/json' }
        });
      }
    } else if (!isPublicPath(pathname) && !isAllowedPage) {
      throw redirect(303, ownInboxPath);
    }
  }

  // CSRF: validate Origin/Referer on state-changing API requests
  if (pathname.startsWith('/api/') && event.request.method !== 'GET' && event.request.method !== 'HEAD') {
    const origin = event.request.headers.get('origin');
    const referer = event.request.headers.get('referer');
    const host = event.url.hostname;
    const allowed = origin
      ? new URL(origin).hostname === host
      : referer
        ? new URL(referer).hostname === host
        : false;
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'CSRF validation failed' }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  const response = await resolve(event);

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CSP — permissive for email HTML rendering, strict for everything else
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);

  return response;
};
