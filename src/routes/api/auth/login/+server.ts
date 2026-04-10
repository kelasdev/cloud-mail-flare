import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUserInDb, getUserAuthByEmail } from '$lib/server/db';
import { createLoginSession, extractClientIp, extractUserAgent, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '$lib/server/session';
import { hashPassword, verifyPassword } from '$lib/server/security';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
}

function isSchemaMismatchError(message: string): boolean {
  return /no such table|no such column|has no column named|SQLITE_ERROR/i.test(message);
}

function isD1Error(message: string): boolean {
  return /D1_ERROR|SQLITE|constraint failed|FOREIGN KEY/i.test(message);
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

  const body = (await request.json().catch(() => null)) as { identifier?: string; password?: string; setupToken?: string; turnstileToken?: string } | null;
  const identifier = body?.identifier?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  const setupToken = body?.setupToken?.trim() ?? '';
  const turnstileToken = body?.turnstileToken ?? '';
  const defaultUserDomain = (platform?.env?.MAILFLARE_USER_DOMAIN ?? 'mailflare.local').trim().toLowerCase();

  if (!identifier || !password) {
    return json({ error: 'identifier and password are required' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: 'password must be 8-128 characters' }, { status: 400 });
  }

  try {
    let user = await getUserAuthByEmail(db, identifier);
    const identifierLooksLikeEmail = identifier.includes('@');
    const identifierAsEmail = identifierLooksLikeEmail ? identifier : `${identifier}@${defaultUserDomain}`;
    if (!user && !identifierLooksLikeEmail) {
      user = await getUserAuthByEmail(db, identifierAsEmail);
    }

    // Verifikasi Cloudflare Turnstile
    const turnstileSecret = platform?.env?.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'; // Menggunakan dummy secret testing
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

    if (!user) {
      const userCount = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
      const totalUsers = Number(userCount?.count ?? 0);

      // Bootstrap first account only when database is empty.
      if (totalUsers === 0) {
        const expectedSetupToken = platform?.env?.SETUP_TOKEN?.trim();
        if (!expectedSetupToken) {
          return json({ error: 'System not properly configured for initialization' }, { status: 500 });
        }
        if (!setupToken) {
          return json({ error: 'Setup token is required for first admin initialization' }, { status: 403 });
        }
        if (setupToken !== expectedSetupToken) {
          return json({ error: 'Invalid setup token' }, { status: 403 });
        }

        const displayName = identifier.split('@')[0] || 'admin';
        const passwordHash = await hashPassword(password);
        const created = await createUserInDb(db, {
          email: identifierAsEmail,
          displayName,
          passwordHash
        });
        user = {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          passwordHash
        };
      } else {
        return json({ error: 'Invalid credentials' }, { status: 401 });
      }
    }

    if (!user.passwordHash) {
      return json({ error: 'Password login is not enabled for this user' }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await createLoginSession(db, user.id, extractUserAgent(request), extractClientIp(request));
    cookies.set(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: SESSION_MAX_AGE_SECONDS
    });

    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    });
  } catch (error) {
    const message = toErrorMessage(error);
    console.error('Login handler error:', message);
    if (isSchemaMismatchError(message)) {
      return json(
        {
          error:
            'Database schema is outdated or incomplete. Re-run schema.sql on D1 (local/remote) and try again.'
        },
        { status: 500 }
      );
    }
    if (isD1Error(message)) {
      return json({ error: `Database error: ${message.slice(0, 240)}` }, { status: 500 });
    }
    return json({ error: `Internal Error: ${message.slice(0, 240)}` }, { status: 500 });
  }
};
