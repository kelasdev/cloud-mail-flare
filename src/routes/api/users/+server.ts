import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUserInDb, getUsersFromDb } from '$lib/server/db';
import { generateSecurePassword, hashPassword } from '$lib/server/security';
import { sendUserCreatedTelegramNotification } from '$lib/server/telegram';

export const GET: RequestHandler = async ({ platform }) => {
  const users = await getUsersFromDb(platform?.env?.DB);
  return json({ users });
};

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const usernameRaw = body?.username?.trim().toLowerCase() ?? '';

  if (!usernameRaw) {
    return json({ error: 'username is required' }, { status: 400 });
  }
  if (usernameRaw.length < 3 || usernameRaw.length > 64) {
    return json({ error: 'username must be 3-64 characters' }, { status: 400 });
  }
  if (usernameRaw.includes('@')) {
    return json({ error: 'username must not contain @' }, { status: 400 });
  }
  if (!/^[a-z0-9._-]+$/.test(usernameRaw)) {
    return json({ error: 'username only supports a-z, 0-9, dot, underscore, and hyphen' }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(usernameRaw)) {
    return json({ error: 'username must start and end with alphanumeric character' }, { status: 400 });
  }

  try {
    const db = platform?.env?.DB;
    if (!db) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }

    const configuredDomain = await resolveUserDomain(db, platform?.env?.MAILFLARE_USER_DOMAIN, locals.sessionEmail);
    const email = `${usernameRaw}@${configuredDomain}`;
    const generatedPassword = generateSecurePassword(18);
    const passwordHash = await hashPassword(generatedPassword);
    const user = await createUserInDb(db, { email, displayName: usernameRaw, passwordHash });
    const createdBy = locals.sessionEmail ?? 'dashboard-admin';
    const telegramSentTo = await sendUserCreatedTelegramNotification(db, platform?.env, {
      username: usernameRaw,
      email,
      password: generatedPassword,
      createdBy
    }).catch(() => 0);

    return json(
      {
        ok: true,
        user,
        credentials: {
          username: usernameRaw,
          email,
          password: generatedPassword
        },
        telegram: {
          sentTo: telegramSentTo
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('users.email')) {
      return json({ error: 'Username already exists for configured domain' }, { status: 409 });
    }
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }

    return json({ error: 'Failed to create user' }, { status: 500 });
  }
};

function sanitizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) {
    return false;
  }
  const labels = domain.split('.');
  if (labels.length < 2) {
    return false;
  }
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

async function resolveUserDomain(
  db: D1Database,
  envDomain: string | undefined,
  sessionEmail: string | undefined
): Promise<string> {
  const dbRow = await db
    .prepare('SELECT value FROM worker_settings WHERE key = ? LIMIT 1')
    .bind('user_email_domain')
    .first<{ value: string | null }>();
  const fromDb = sanitizeDomain(String(dbRow?.value ?? ''));
  if (isValidDomain(fromDb)) {
    return fromDb;
  }

  const fromEnv = sanitizeDomain(envDomain ?? '');
  if (isValidDomain(fromEnv)) {
    return fromEnv;
  }

  const fromSession = sanitizeDomain((sessionEmail?.split('@')[1] ?? '').trim());
  if (isValidDomain(fromSession)) {
    return fromSession;
  }

  return 'mailflare.local';
}
