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
  const usernameRaw = (url.searchParams.get('username') ?? '').trim().toLowerCase();
  const invalidReason = validateUsername(usernameRaw);
  if (invalidReason) {
    return publicError(400, 'BAD_REQUEST', invalidReason);
  }

  const limit = parseIntegerRange(url.searchParams.get('limit'), 20, 1, 100);
  if (!limit.ok) {
    return publicError(400, 'BAD_REQUEST', limit.error);
  }
  const offset = parseIntegerRange(url.searchParams.get('offset'), 0, 0, 1_000_000);
  if (!offset.ok) {
    return publicError(400, 'BAD_REQUEST', offset.error);
  }

  const includeArchivedRaw = (url.searchParams.get('include_archived') ?? 'false').trim().toLowerCase();
  if (includeArchivedRaw !== 'true' && includeArchivedRaw !== 'false') {
    return publicError(400, 'BAD_REQUEST', 'include_archived must be true or false');
  }
  const includeArchived = includeArchivedRaw === 'true';

  try {
    const user = await db
      .prepare(
        `
        SELECT id, email
        FROM users
        WHERE lower(substr(email, 1, instr(email, '@') - 1)) = lower(?)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
      )
      .bind(usernameRaw)
      .first<{ id: string; email: string }>();

    if (!user) {
      return publicError(404, 'NOT_FOUND', 'User not found');
    }

    const archiveCondition = includeArchived ? '' : 'AND is_archived = 0';
    const [countRow, listRows] = await Promise.all([
      db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM emails
          WHERE user_id = ?
            AND deleted_at IS NULL
            ${archiveCondition}
        `
        )
        .bind(user.id)
        .first<{ count: number }>(),
      db
        .prepare(
          `
          SELECT id, sender, subject, snippet, received_at, is_read, is_starred, is_archived
          FROM emails
          WHERE user_id = ?
            AND deleted_at IS NULL
            ${archiveCondition}
          ORDER BY received_at DESC, id DESC
          LIMIT ? OFFSET ?
        `
        )
        .bind(user.id, limit.value, offset.value)
        .all<Record<string, unknown>>()
    ]);

    const emails = (listRows.results ?? []).map((row) => ({
      id: String(row.id ?? ''),
      sender: String(row.sender ?? ''),
      subject: String(row.subject ?? '(No Subject)'),
      snippet: String(row.snippet ?? ''),
      receivedAt: String(row.received_at ?? ''),
      isRead: Number(row.is_read ?? 0) === 1,
      isStarred: Number(row.is_starred ?? 0) === 1,
      isArchived: Number(row.is_archived ?? 0) === 1
    }));

    return json({
      ok: true,
      data: {
        user: {
          id: user.id,
          username: extractUsername(user.email),
          email: user.email
        },
        total: Number(countRow?.count ?? 0),
        limit: limit.value,
        offset: offset.value,
        includeArchived,
        emails
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
    }
    return publicError(500, 'INTERNAL_ERROR', 'Failed to load user mailbox');
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

function validateUsername(usernameRaw: string): string | null {
  if (!usernameRaw) {
    return 'username is required';
  }
  if (usernameRaw.length < 3 || usernameRaw.length > 64) {
    return 'username must be 3-64 characters';
  }
  if (usernameRaw.includes('@')) {
    return 'username must not contain @';
  }
  if (!/^[a-z0-9._-]+$/.test(usernameRaw)) {
    return 'username only supports a-z, 0-9, dot, underscore, and hyphen';
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(usernameRaw)) {
    return 'username must start and end with alphanumeric character';
  }
  return null;
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

function extractUsername(email: string): string {
  return String(email.split('@')[0] ?? '').toLowerCase();
}
