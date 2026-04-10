import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAccessCodeFormatValid, normalizeAccessCode } from '$lib/server/access-code';
import { randomToken, sha256Hex } from '$lib/server/security';
import {
  createLoginSession,
  extractClientIp,
  extractUserAgent,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from '$lib/server/session';

interface AccessCodeBody {
  code?: string;
  turnstileToken?: string;
}

export const POST: RequestHandler = async ({ request, cookies, platform, url }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'Database is not configured' }, { status: 503 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as AccessCodeBody | null;
  const turnstileToken = body?.turnstileToken ?? '';
  const turnstileSecret = platform?.env?.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';

  if (turnstileSecret && turnstileToken) {
    const formData = new FormData();
    formData.append('secret', turnstileSecret);
    formData.append('response', turnstileToken);
    
    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }
    
    try {
      const tsResult = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body: formData,
        method: 'POST'
      });
      const tsOutcome = await tsResult.json() as any;
      if (!tsOutcome.success) {
        return json({ error: 'Verifikasi keamanan Turnstile gagal. Silakan muat ulang halaman.' }, { status: 403 });
      }
    } catch (e) {
      return json({ error: 'Gagal terhubung dengan layanan keamanan saat ini.' }, { status: 500 });
    }
  } else if (!turnstileToken) {
      return json({ error: 'Selesaikan verifikasi keamanan / Captcha terlebih dahulu' }, { status: 400 });
  }

  const normalizedCode = normalizeAccessCode(body?.code ?? '');
  if (!isAccessCodeFormatValid(normalizedCode)) {
    return json({ error: 'Invalid access code format' }, { status: 400 });
  }

  const codeHash = await sha256Hex(normalizedCode);
  const codeRow = await db
    .prepare(
      `
      SELECT id
      FROM access_codes
      WHERE code_hash = ?
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `
    )
    .bind(codeHash)
    .first<{ id: string }>();

  if (!codeRow?.id) {
    return json({ error: 'Access code is invalid or expired' }, { status: 401 });
  }

  const markUsed = await db
    .prepare(
      `
      UPDATE access_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND used_at IS NULL
    `
    )
    .bind(codeRow.id)
    .run();
  const markChanges = Number((markUsed.meta as { changes?: number } | undefined)?.changes ?? 0);
  if (markChanges === 0) {
    return json({ error: 'Access code has been used' }, { status: 409 });
  }

  const owner = await db
    .prepare(
      `
      SELECT id, email
      FROM users
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `
    )
    .first<{ id: string; email: string }>();

  if (!owner?.id) {
    return json({ error: 'No admin user found to attach session' }, { status: 409 });
  }

  const userAgent = extractUserAgent(request);
  const clientIp = extractClientIp(request);
  const loginToken = await createLoginSession(db, owner.id, userAgent, clientIp);

  const accessSessionTokenHash = await sha256Hex(randomToken());
  await db
    .prepare(
      `
      INSERT INTO access_sessions (id, token_hash, code_id, created_at, expires_at, user_agent, client_ip)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+15 minute'), ?, ?)
    `
    )
    .bind(crypto.randomUUID(), accessSessionTokenHash, codeRow.id, userAgent, clientIp)
    .run();

  cookies.set(SESSION_COOKIE_NAME, loginToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  return json({
    ok: true,
    user: {
      id: owner.id,
      email: owner.email
    }
  });
};
