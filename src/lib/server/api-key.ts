import { randomToken, sha256Hex } from '$lib/server/security';

export const API_KEY_PREFIX = 'cmf_v1_';
const API_KEY_NAME_DEFAULT = 'default';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const requestWindowByKeyHash = new Map<string, { count: number; resetAt: number }>();

export interface ApiKeyRecord {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface ApiKeyStatus {
  hasActiveKey: boolean;
  activeKey: ApiKeyRecord | null;
}

export interface IssuedApiKey {
  apiKey: string;
  activeKey: ApiKeyRecord;
}

type GenerateIfAbsentResult =
  | {
      ok: true;
      issued: IssuedApiKey;
    }
  | {
      ok: false;
      reason: 'active_exists';
      activeKey: ApiKeyRecord;
    };

type ApiKeyAuthFailureCode = 'UNAUTHORIZED' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE';

interface ApiKeyAuthFailure {
  ok: false;
  status: 401 | 429 | 503;
  error: {
    ok: false;
    error: {
      code: ApiKeyAuthFailureCode;
      message: string;
    };
  };
}

interface ApiKeyAuthSuccess {
  ok: true;
  key: ApiKeyRecord & { keyHash: string };
}

export type ApiKeyAuthResult = ApiKeyAuthSuccess | ApiKeyAuthFailure;

export function isApiKeyFormatValid(value: string): boolean {
  if (!value.startsWith(API_KEY_PREFIX)) {
    return false;
  }
  const token = value.slice(API_KEY_PREFIX.length);
  if (token.length < 20 || token.length > 120) {
    return false;
  }
  return /^[A-Za-z0-9_-]+$/.test(token);
}

export function extractApiKeyFromRequest(request: Request): string {
  const headerKey = request.headers.get('x-api-key')?.trim() ?? '';
  if (headerKey) {
    return headerKey;
  }

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization) {
    return '';
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer') {
    return '';
  }
  return token?.trim() ?? '';
}

export async function getActiveApiKeyStatus(db: D1Database | undefined): Promise<ApiKeyStatus> {
  if (!db) {
    throw new Error('DB binding is required for api key operation');
  }

  const row = await db
    .prepare(
      `
      SELECT id, name, created_by, created_at
      FROM api_keys
      WHERE revoked_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
    )
    .first<Record<string, unknown>>();

  const activeKey = toApiKeyRecord(row);
  return {
    hasActiveKey: Boolean(activeKey),
    activeKey
  };
}

export async function generateApiKeyIfAbsent(
  db: D1Database | undefined,
  input: { createdBy: string; name?: string }
): Promise<GenerateIfAbsentResult> {
  if (!db) {
    throw new Error('DB binding is required for api key operation');
  }

  const status = await getActiveApiKeyStatus(db);
  if (status.activeKey) {
    return {
      ok: false,
      reason: 'active_exists',
      activeKey: status.activeKey
    };
  }

  return {
    ok: true,
    issued: await insertIssuedApiKey(db, input)
  };
}

export async function regenerateApiKey(
  db: D1Database | undefined,
  input: { createdBy: string; name?: string }
): Promise<IssuedApiKey> {
  if (!db) {
    throw new Error('DB binding is required for api key operation');
  }

  await db.prepare('UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE revoked_at IS NULL').run();
  return insertIssuedApiKey(db, input);
}

export async function authenticatePublicApiRequest(
  db: D1Database | undefined,
  request: Request
): Promise<ApiKeyAuthResult> {
  if (!db) {
    return {
      ok: false,
      status: 503,
      error: buildApiError('SERVICE_UNAVAILABLE', 'Database is not configured')
    };
  }

  const apiKey = extractApiKeyFromRequest(request);
  if (!apiKey || !isApiKeyFormatValid(apiKey)) {
    return {
      ok: false,
      status: 401,
      error: buildApiError('UNAUTHORIZED', 'Invalid API key')
    };
  }

  const keyHash = await sha256Hex(apiKey);
  const row = await db
    .prepare(
      `
      SELECT id, name, created_by, created_at
      FROM api_keys
      WHERE key_hash = ?
        AND revoked_at IS NULL
      LIMIT 1
    `
    )
    .bind(keyHash)
    .first<Record<string, unknown>>();

  const key = toApiKeyRecord(row);
  if (!key) {
    return {
      ok: false,
      status: 401,
      error: buildApiError('UNAUTHORIZED', 'Invalid API key')
    };
  }

  const limiter = consumeRateLimitToken(keyHash);
  if (!limiter.allowed) {
    return {
      ok: false,
      status: 429,
      error: buildApiError('RATE_LIMITED', `Too many requests. Retry in ${limiter.retryAfterSeconds}s`)
    };
  }

  return {
    ok: true,
    key: {
      ...key,
      keyHash
    }
  };
}

function buildApiError(code: ApiKeyAuthFailureCode, message: string): ApiKeyAuthFailure['error'] {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

async function insertIssuedApiKey(
  db: D1Database,
  input: { createdBy: string; name?: string }
): Promise<IssuedApiKey> {
  const normalizedName = (input.name?.trim() || API_KEY_NAME_DEFAULT).slice(0, 120);
  const createdBy = (input.createdBy?.trim() || 'system').slice(0, 190);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const apiKey = `${API_KEY_PREFIX}${randomToken()}`;
    const keyHash = await sha256Hex(apiKey);
    const id = crypto.randomUUID();

    try {
      await db
        .prepare(
          `
          INSERT INTO api_keys (id, key_hash, name, created_by, created_at, revoked_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
        `
        )
        .bind(id, keyHash, normalizedName, createdBy)
        .run();

      const row = await db
        .prepare(
          `
          SELECT id, name, created_by, created_at
          FROM api_keys
          WHERE id = ?
          LIMIT 1
        `
        )
        .bind(id)
        .first<Record<string, unknown>>();

      const activeKey = toApiKeyRecord(row);
      if (!activeKey) {
        throw new Error('Failed to load issued api key');
      }

      return {
        apiKey,
        activeKey
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes('unique') || message.includes('key_hash')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to generate unique API key');
}

function toApiKeyRecord(row: Record<string, unknown> | null): ApiKeyRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? '')
  };
}

function consumeRateLimitToken(keyHash: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const prev = requestWindowByKeyHash.get(keyHash);
  if (!prev || prev.resetAt <= now) {
    requestWindowByKeyHash.set(keyHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (prev.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((prev.resetAt - now) / 1000))
    };
  }

  prev.count += 1;
  requestWindowByKeyHash.set(keyHash, prev);
  return { allowed: true, retryAfterSeconds: 0 };
}
