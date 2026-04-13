import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticatePublicApiRequest } from '$lib/server/api-key';
import { renderEmailContent } from '$lib/server/rendered-email';

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
  const emailId = (url.searchParams.get('email_id') ?? '').trim();
  if (!emailId) {
    return publicError(400, 'BAD_REQUEST', 'email_id is required');
  }

  try {
    const row = await db
      .prepare(
        `
        SELECT
          e.id,
          e.user_id,
          u.email AS user_email,
          e.sender,
          e.recipient,
          e.subject,
          e.snippet,
          e.received_at,
          e.is_read,
          e.is_starred,
          e.is_archived,
          e.parsed_html,
          e.body_html,
          e.parsed_text,
          e.body_text
        FROM emails e
        JOIN users u ON u.id = e.user_id
        WHERE e.id = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `
      )
      .bind(emailId)
      .first<Record<string, unknown>>();

    if (!row) {
      return publicError(404, 'NOT_FOUND', 'Email not found');
    }

    if (Number(row.is_read ?? 0) !== 1) {
      await db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(String(row.id ?? '')).run();
    }

    const rendered = renderEmailContent({
      parsedHtml: String(row.parsed_html ?? ''),
      bodyHtml: String(row.body_html ?? ''),
      parsedText: String(row.parsed_text ?? ''),
      bodyText: String(row.body_text ?? ''),
      snippet: String(row.snippet ?? '')
    });
    const userEmail = String(row.user_email ?? '');

    return json({
      ok: true,
      data: {
        id: String(row.id ?? ''),
        user: {
          id: String(row.user_id ?? ''),
          username: extractUsername(userEmail),
          email: userEmail
        },
        sender: String(row.sender ?? ''),
        recipient: String(row.recipient ?? ''),
        subject: String(row.subject ?? '(No Subject)'),
        snippet: String(row.snippet ?? ''),
        receivedAt: String(row.received_at ?? ''),
        renderedContent: rendered.renderedContent,
        renderedSource: rendered.renderedSource,
        isRead: true,
        isStarred: Number(row.is_starred ?? 0) === 1,
        isArchived: Number(row.is_archived ?? 0) === 1
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
    }
    return publicError(500, 'INTERNAL_ERROR', 'Failed to read email');
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

function extractUsername(email: string): string {
  return String(email.split('@')[0] ?? '').toLowerCase();
}
