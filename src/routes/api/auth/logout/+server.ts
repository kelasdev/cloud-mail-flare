import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeSessionByToken, SESSION_COOKIE_NAME } from '$lib/server/session';

async function clearSession(event: Parameters<RequestHandler>[0]) {
  const token = event.cookies.get(SESSION_COOKIE_NAME) ?? '';
  const db = event.platform?.env?.DB;

  if (db && token) {
    await revokeSessionByToken(db, token);
  }

  event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return json({ ok: true });
}

export const GET: RequestHandler = async (event) => clearSession(event);
export const POST: RequestHandler = async (event) => clearSession(event);
