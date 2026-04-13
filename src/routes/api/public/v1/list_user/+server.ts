import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticatePublicApiRequest } from '$lib/server/api-key';

type PublicErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export const GET: RequestHandler = async ({ platform, request }) => {
  const auth = await authenticatePublicApiRequest(platform?.env?.DB, request);
  if (!auth.ok) {
    return json(auth.error, { status: auth.status });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
  }

  const url = new URL(request.url);
  const orderRaw = (url.searchParams.get('order') ?? 'desc').trim().toLowerCase();
  if (orderRaw && orderRaw !== 'asc' && orderRaw !== 'desc') {
    return publicError(400, 'BAD_REQUEST', 'order must be asc or desc');
  }
  const sortOrder = orderRaw === 'asc' ? 'asc' : 'desc';
  const sortSql = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const limit = parseIntegerRange(url.searchParams.get('limit'), 50, 1, 100);
  if (!limit.ok) {
    return publicError(400, 'BAD_REQUEST', limit.error);
  }

  const offset = parseIntegerRange(url.searchParams.get('offset'), 0, 0, 1_000_000);
  if (!offset.ok) {
    return publicError(400, 'BAD_REQUEST', offset.error);
  }

  try {
    const [countRow, listRows] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
      db
        .prepare(
          `
          WITH owner AS (
            SELECT id AS owner_id
            FROM users
            ORDER BY created_at ASC, id ASC
            LIMIT 1
          )
          SELECT
            u.id,
            u.email,
            COALESCE(u.display_name, u.email) AS display_name,
            CASE WHEN u.id = (SELECT owner_id FROM owner) THEN 'owner' ELSE 'member' END AS role,
            CASE WHEN u.password_hash IS NULL THEN 'disabled' ELSE 'active' END AS status,
            (
              SELECT COUNT(*)
              FROM emails e
              WHERE e.user_id = u.id
                AND e.deleted_at IS NULL
            ) AS total_emails,
            (
              SELECT COUNT(*)
              FROM emails e
              WHERE e.user_id = u.id
                AND e.deleted_at IS NULL
                AND e.is_read = 0
            ) AS unread_emails
          FROM users u
          ORDER BY u.created_at ${sortSql}, u.id ${sortSql}
          LIMIT ? OFFSET ?
        `
        )
        .bind(limit.value, offset.value)
        .all<Record<string, unknown>>()
    ]);

    const users = (listRows.results ?? []).map((row) => ({
      id: String(row.id ?? ''),
      email: String(row.email ?? ''),
      displayName: String(row.display_name ?? ''),
      role: String(row.role ?? 'member'),
      status: String(row.status ?? 'active') === 'disabled' ? 'disabled' : 'active',
      totalEmails: Number(row.total_emails ?? 0),
      unreadEmails: Number(row.unread_emails ?? 0)
    }));

    return json({
      ok: true,
      data: {
        total: Number(countRow?.count ?? 0),
        order: sortOrder,
        limit: limit.value,
        offset: offset.value,
        users
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
    }
    return publicError(500, 'INTERNAL_ERROR', 'Failed to list users');
  }
};

function publicError(status: number, code: PublicErrorCode, message: string) {
  return json(
    {
      ok: false,
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function parseIntegerRange(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw || !raw.trim()) {
    return { ok: true, value: fallback };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { ok: false, error: 'Query parameter must be an integer' };
  }
  if (parsed < min || parsed > max) {
    return { ok: false, error: `Query parameter must be in range ${min}-${max}` };
  }
  return { ok: true, value: parsed };
}
