import { randomToken, sha256Hex } from '$lib/server/security';

export const SESSION_COOKIE_NAME = 'mailflare_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface AuthSession {
  userId: string;
  email: string;
  role: 'owner' | 'member';
}

function normalizeMeta(value: string | null, limit: number): string {
  return (value ?? '').trim().slice(0, limit);
}

export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return normalizeMeta(cfIp, 64);
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim() ?? '';
    return normalizeMeta(first, 64);
  }

  return '';
}

export function extractUserAgent(request: Request): string {
  return normalizeMeta(request.headers.get('user-agent'), 255);
}

export async function createLoginSession(
  db: D1Database,
  userId: string,
  userAgent: string,
  clientIp: string
): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  await db
    .prepare(
      `
      INSERT INTO login_sessions (id, token_hash, user_id, created_at, expires_at, user_agent, client_ip)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+7 day'), ?, ?)
    `
    )
    .bind(crypto.randomUUID(), tokenHash, userId, normalizeMeta(userAgent, 255), normalizeMeta(clientIp, 64))
    .run();

  return token;
}

export async function getSessionByToken(db: D1Database, token: string): Promise<AuthSession | null> {
  const normalized = token.trim();
  if (!normalized) {
    return null;
  }

  const tokenHash = await sha256Hex(normalized);
  const row = await db
    .prepare(
      `
      WITH owner AS (
        SELECT id AS owner_id
        FROM users
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      )
      SELECT
        ls.user_id,
        u.email,
        CASE
          WHEN ls.user_id = (SELECT owner_id FROM owner) THEN 'owner'
          ELSE 'member'
        END AS role
      FROM login_sessions ls
      JOIN users u ON u.id = ls.user_id
      WHERE ls.token_hash = ?
        AND ls.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `
    )
    .bind(tokenHash)
    .first<{ user_id: string; email: string; role: 'owner' | 'member' }>();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    email: row.email,
    role: row.role === 'owner' ? 'owner' : 'member'
  };
}

export async function revokeSessionByToken(db: D1Database, token: string): Promise<void> {
  const normalized = token.trim();
  if (!normalized) {
    return;
  }

  const tokenHash = await sha256Hex(normalized);
  await db.prepare('DELETE FROM login_sessions WHERE token_hash = ?').bind(tokenHash).run();
}
