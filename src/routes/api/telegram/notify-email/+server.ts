import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendInboundEmailTelegramNotification } from '$lib/server/telegram';
import { upsertInboundEmailInDb } from '$lib/server/db';

interface NotifyEmailBody {
  emailId?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  receivedAt?: string;
  rawMime?: string;
  contentType?: string;
  headersJson?: string;
  skipPersist?: boolean;
}

function hasSecretAccess(expectedSecret: string, providedSecret: string): boolean {
  if (!expectedSecret) {
    return false;
  }
  return expectedSecret === providedSecret;
}

function isInternalWorkerNotifyRequest(request: Request): boolean {
  const marker = (request.headers.get('x-mailflare-internal-request') ?? '').trim();
  if (marker !== '1') {
    return false;
  }

  try {
    const url = new URL(request.url);
    return url.hostname === 'mailflare.internal';
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'Database is not configured' }, { status: 503 });
  }

  if (!locals.authenticated) {
    const expected = (platform?.env?.TELEGRAM_INTERNAL_SECRET ?? '').trim();
    const provided = (request.headers.get('x-mailflare-telegram-secret') ?? '').trim();
    const allowInternalBypass = isInternalWorkerNotifyRequest(request);
    if (!allowInternalBypass && !hasSecretAccess(expected, provided)) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as NotifyEmailBody | null;
  if (!body) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const emailId = body.emailId?.trim() ?? '';
  const sender = body.sender?.trim() ?? '';
  const recipient = body.recipient?.trim() ?? '';
  const subject = body.subject?.trim() ?? '';
  const snippet = body.snippet?.trim() ?? '';
  const bodyText = body.bodyText?.trim() ?? '';
  const receivedAt = body.receivedAt?.trim() ?? '';
  const rawMime = body.rawMime?.trim() ?? '';
  const emailContentType = body.contentType?.trim() ?? '';
  const headersJson = body.headersJson?.trim() ?? '';
  const skipPersist = body.skipPersist === true;

  if (!emailId || !sender || !recipient) {
    return json({ error: 'emailId, sender, and recipient are required' }, { status: 400 });
  }

  try {
    let stored = false;
    if (!skipPersist) {
      const storeResult = await upsertInboundEmailInDb(db, {
        emailId,
        sender,
        recipient,
        subject,
        snippet,
        bodyText,
        receivedAt,
        rawMime,
        contentType: emailContentType,
        headersJson
      });
      stored = storeResult.stored;
      if (!stored) {
        return json({ error: `Failed to persist inbound email: ${storeResult.reason ?? 'unknown'}` }, { status: 400 });
      }
    }

    const sentTo = await sendInboundEmailTelegramNotification(db, platform?.env, {
      emailId,
      sender,
      recipient,
      subject,
      snippet
    });

    return json({ ok: true, sentTo, stored });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Failed to send inbound notification: ${message}` }, { status: 500 });
  }
};
