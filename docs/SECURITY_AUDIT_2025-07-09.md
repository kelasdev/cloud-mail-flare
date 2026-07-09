# Security Vulnerability Audit 2025-07-09

**Project:** cloud-mail-flare (SvelteKit + Cloudflare Workers + D1)
**Scope:** Full attack surface - auth, API, database, secrets, CSRF

---

## Severity Legend

| Symbol | Meaning |
|--------|---------|
| CRITICAL | Immediately exploitable, full system compromise |
| HIGH | Exploitable with minimal effort, significant impact |
| MEDIUM | Requires specific conditions or chaining |
| LOW | Defense-in-depth improvement |

---

## CRITICAL-01 - Secrets Committed to Git

**File:** .dev.vars (lines 7-22)

Real credentials tracked in repo: SETUP_TOKEN, TURNSTILE_SECRET_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_INTERNAL_SECRET.

**Root Cause:** .dev.vars in .gitignore but committed before rule existed.

**Exploitation:** Clone repo, read secrets, create admin, bypass CAPTCHA, full bot control.

**Fix:** Rotate all secrets via wrangler secret put, remove from git history (BFG), add pre-commit hook.

---

## CRITICAL-02 - IDOR in Public read_email API

**Endpoint:** GET /api/public/v1/read_email?email_id=X

Query has NO user_id filter - reads ANY email in the system with any valid API key.



**Fix:** Add AND e.user_id = ? bound to authenticated key owner.

---

## CRITICAL-03 - Unauthenticated Sensitive Endpoints

These GET endpoints return sensitive data with zero auth:

- GET /api/users - all users, emails, roles
- GET /api/users/[userId] - individual user detail
- GET /api/dashboard - full dashboard metrics
- GET /api/worker-settings - Telegram tokens, webhook secrets

**Root Cause:** isPublicPath() in hooks.server.ts bypasses auth for these routes.

**Fix:** Remove from isPublicPath() or add auth checks inside handlers.

---

## HIGH-04 - No Role Check on User Edit/Delete

PATCH /api/users/[userId] checks locals.authenticated but NOT locals.sessionRole. A member account can edit/delete any user including the owner.

**File:** src/routes/api/users/[userId]/+server.ts:15-18

**Fix:** Add if (locals.sessionRole !== owner) return 403 to PATCH and DELETE handlers.

---

## HIGH-05 - Access Code Attaches to Owner, Not Code Issuer

/api/auth/access-code always creates session for first user (owner), regardless of who generated the code via Telegram.

**File:** src/routes/api/auth/access-code/+server.ts:99-116

**Fix:** Store user_id in access_codes table; bind session to that user.

---

## HIGH-06 - Members Can Access Admin Public API

hooks.server.ts includes /api/public/v1/ in member allowlist (line 76). Members can call create_user, list_user, read_email, user_mailbox.

**Fix:** Remove /api/public/v1/ from member allowlist.

---

## MEDIUM-07 - Rate Limiting Is In-Memory Only

requestWindowByKeyHash Map resets on every Cloudflare Worker cold start. 120 req/min limit is effectively unenforced.

**Fix:** Use Cloudflare KV for rate limit state, or use Cloudflare Rate Limiting rules.

---

## MEDIUM-08 - Session Not Revoked on Password Change

PATCH /api/users/[userId] with password field updates password_hash but does NOT revoke existing sessions in login_sessions table.

**Impact:** Compromised sessions survive password changes.

**Fix:** After password update, run DELETE FROM login_sessions WHERE user_id = ?.

---

## MEDIUM-09 - Turnstile Bypass via Empty Secret

const turnstileSecret = platform?.env?.TURNSTILE_SECRET_KEY || dummy_key

If TURNSTILE_SECRET_KEY is unset in production, the fallback dummy key always passes verification.

**Fix:** Fail closed - if secret is missing, block the request or require explicit disable via feature flag.

---

## MEDIUM-10 - CSRF on Session-Protected Mutations

Session cookie uses sameSite: lax, which protects GET but not POST/PUT/PATCH/DELETE from cross-site requests. No CSRF tokens used.

**Fix:** Add CSRF token validation or use SameSite=strict.

---

## LOW-11 - user_mailbox Exposes Email List Without Ownership Check

Endpoint looks up user by username (any user), not by the authenticated caller. Any API key holder can list any user inbox.

**Fix:** Restrict to owner API keys only, or add user_id filter tied to key owner.

---

## LOW-12 - Error Messages Leak DB Internals

Several catch blocks return raw error messages that leak table names, column names, SQL structure.

**Fix:** Return generic messages in production; log details server-side.

---

## Summary

| # | Severity | Vulnerability | Fix Effort |
|---|----------|---------------|------------|
| C-01 | CRITICAL | Secrets in git | Rotate + BFG |
| C-02 | CRITICAL | IDOR in read_email | 1-line SQL fix |
| C-03 | CRITICAL | Unauthenticated data leaks | Add auth checks |
| H-04 | HIGH | No role check on mutations | 2-line guard |
| H-05 | HIGH | Access code owner-only | Schema + query |
| H-06 | HIGH | Member bypass to admin API | 1-line remove |
| M-07 | MEDIUM | Ephemeral rate limits | KV migration |
| M-08 | MEDIUM | Stale sessions after pw change | 1 DELETE query |
| M-09 | MEDIUM | Turnstile dummy fallback | Fail-closed |
| M-10 | MEDIUM | CSRF on mutations | Token or strict |
| L-11 | LOW | mailbox cross-user read | Owner-only gate |
| L-12 | LOW | Error message leak | Sanitize |
