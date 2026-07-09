/**
 * Simple in-memory sliding-window rate limiter.
 * Resets on cold start (acceptable for Cloudflare Workers).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const prev = store.get(key);

  if (!prev || prev.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (prev.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((prev.resetAt - now) / 1000))
    };
  }

  prev.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Extract client IP for rate limit keying.
 */
export function rateLimitKey(request: Request, prefix: string): string {
  const ip =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return `${prefix}:${ip}`;
}
