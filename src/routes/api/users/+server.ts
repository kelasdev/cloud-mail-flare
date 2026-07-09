import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUserInDb, getUsersFromDb } from '$lib/server/db';
import { generateSecurePassword, hashPassword } from '$lib/server/security';
import { sendUserCreatedTelegramNotification } from '$lib/server/telegram';

export const GET: RequestHandler = async ({ platform, locals }) => {
  if (!locals.authenticated || locals.sessionRole !== 'owner') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  const users = await getUsersFromDb(platform?.env?.DB);
  return json({ users });
};

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!locals.authenticated || locals.sessionRole !== 'owner') {
    return json({ error: 'Forbidden' }, { status: 403 });
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

    const domain = await resolveUserDomain(db, platform?.env?.MAILFLARE_USER_DOMAIN, locals.sessionEmail);
    const email = `${usernameRaw}@${domain}`;
    const password = generateSecurePassword();
    const passwordHash = await hashPassword(password);
    const displayName = usernameRaw;

    const created = await createUserInDb(db, {
      email,
      displayName,
      passwordHash
    });

    await sendUserCreatedTelegramNotification(db, platform?.env, {
      username: usernameRaw,
      email,
      password,
      createdBy: locals.sessionEmail ?? 'admin'
    }).catch(() => 0);

    return json({
      ok: true,
      user: {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
        password
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNIQUE constraint failed')) {
      return json({ error: 'Username already exists' }, { status: 409 });
    }
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }
    console.error('Create user error:', message);
    return json({ error: 'Failed to create user' }, { status: 500 });
  }
};

function sanitizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain);
}

async function resolveUserDomain(
  db: D1Database,
  envDomain: string | undefined,
  sessionEmail: string | undefined
): Promise<string> {
  const envValue = sanitizeDomain(envDomain ?? '');
  if (envValue && isValidDomain(envValue)) {
    return envValue;
  }

  const fallback = sessionEmail?.split('@')[1];
  if (fallback && isValidDomain(fallback)) {
    return fallback;
  }

  return 'mailflare.local';
}
