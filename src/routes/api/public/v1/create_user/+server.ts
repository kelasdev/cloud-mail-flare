import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticatePublicApiRequest } from '$lib/server/api-key';
import { createUserInDb } from '$lib/server/db';
import { generateSecurePassword, hashPassword } from '$lib/server/security';
import { sendUserCreatedTelegramNotification } from '$lib/server/telegram';

type PublicErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export const POST: RequestHandler = async ({ platform, request }) => {
  const auth = await authenticatePublicApiRequest(platform?.env?.DB, request);
  if (!auth.ok) {
    return json(auth.error, { status: auth.status });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return publicError(400, 'BAD_REQUEST', 'Expected JSON body');
  }

  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const usernameRaw = body?.username?.trim().toLowerCase() ?? '';
  const invalidReason = validateUsername(usernameRaw);
  if (invalidReason) {
    return publicError(400, 'BAD_REQUEST', invalidReason);
  }

  try {
    const db = platform?.env?.DB;
    if (!db) {
      return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
    }

    const configuredDomain = await resolveUserDomain(db, platform?.env?.MAILFLARE_USER_DOMAIN);
    const email = `${usernameRaw}@${configuredDomain}`;
    const generatedPassword = generateSecurePassword(18);
    const passwordHash = await hashPassword(generatedPassword);
    const user = await createUserInDb(db, { email, displayName: usernameRaw, passwordHash });

    await sendUserCreatedTelegramNotification(db, platform?.env, {
      username: usernameRaw,
      email,
      password: generatedPassword,
      createdBy: `api-key:${auth.key.id}`
    }).catch(() => 0);

    return json(
      {
        ok: true,
        data: {
          user,
          credentials: {
            username: usernameRaw,
            email,
            password: generatedPassword
          }
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('users.email')) {
      return publicError(409, 'CONFLICT', 'Username already exists for configured domain');
    }
    if (message.includes('DB binding is required')) {
      return publicError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured');
    }
    return publicError(500, 'INTERNAL_ERROR', 'Failed to create user');
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

async function resolveUserDomain(db: D1Database, envDomain: string | undefined): Promise<string> {
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

  return 'mailflare.local';
}
