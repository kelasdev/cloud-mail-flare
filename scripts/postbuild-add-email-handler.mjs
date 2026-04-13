import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerPath = resolve('.svelte-kit', 'cloudflare', '_worker.js');
const wranglerTomlPath = resolve('wrangler.toml');
const marker = '/* MAILFLARE_EMAIL_HANDLER */';
const exportBlockPattern = /export\s*\{\s*worker_default as default\s*\};\s*$/m;

const source = readFileSync(workerPath, 'utf8');
const wranglerVars = loadWranglerVars();
const fallbackUserDomain = (wranglerVars.MAILFLARE_USER_DOMAIN ?? '').trim().toLowerCase();
const fallbackNotifyUrl = (wranglerVars.MAILFLARE_NOTIFY_URL ?? '').trim();

function loadWranglerVars() {
  let content = '';
  try {
    content = readFileSync(wranglerTomlPath, 'utf8');
  } catch {
    return {};
  }

  const vars = {};
  let inVarsSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      inVarsSection = line === '[vars]';
      continue;
    }

    if (!inVarsSection) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = line.slice(equalsIndex + 1).trim();
    vars[key] = parseTomlValue(rawValue);
  }

  return vars;
}

function parseTomlValue(rawValue) {
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.slice(1, -1);
    }
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  const commentIndex = rawValue.indexOf('#');
  if (commentIndex >= 0) {
    return rawValue.slice(0, commentIndex).trim();
  }

  return rawValue.trim();
}

if (source.includes(marker)) {
  process.exit(0);
}

if (!exportBlockPattern.test(source)) {
  throw new Error(`Unable to patch email handler: expected export block not found in ${workerPath}`);
}

const injected = `${marker}
const __mailflareFallbackUserDomain = ${JSON.stringify(fallbackUserDomain)};
const __mailflareFallbackNotifyUrl = ${JSON.stringify(fallbackNotifyUrl)};

function __mailflareNormalizeMessageId(value) {
  const normalized = String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[^a-zA-Z0-9._:@-]/g, '-')
    .slice(0, 120)
    .trim();
  return normalized || crypto.randomUUID();
}

function __mailflareGetHeader(message, name) {
  const headers = message && message.headers;
  if (!headers || typeof headers.get !== 'function') {
    return '';
  }
  return String(headers.get(name) || '').trim();
}

function __mailflareHeadersToJson(message) {
  const headers = message && message.headers;
  if (!headers || typeof headers.forEach !== 'function') {
    return '';
  }
  const out = {};
  headers.forEach((value, key) => {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    const next = String(value || '').trim();
    if (!next) return;
    if (out[k]) {
      out[k] = String(out[k]) + '\\n' + next;
      return;
    }
    out[k] = next;
  });
  const serialized = JSON.stringify(out);
  return serialized.length > 30000 ? serialized.slice(0, 30000) : serialized;
}

function __mailflareBuildNotifyUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsed = new URL(value);
    parsed.pathname = '/api/telegram/notify-email';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function __mailflareNormalizeAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const angleMatch = raw.match(/<([^>]+)>/);
  const addr = angleMatch ? angleMatch[1] : raw;
  const single = addr.split(',')[0].split(';')[0];
  return single.replace(new RegExp('\\\\s+', 'g'), '');
}

async function __mailflareReadRawMime(message) {
  const raw = message && message.raw;
  if (!raw) {
    return '';
  }
  try {
    const text = await new Response(raw).text();
    return text.length > 250000 ? text.slice(0, 250000) : text;
  } catch {
    return '';
  }
}

function __mailflareDeriveBodyText(rawMime, fallbackText) {
  const fallback = String(fallbackText || '').trim();
  if (!rawMime) {
    return fallback;
  }
  const parts = String(rawMime).split(/\\r?\\n\\r?\\n/);
  if (parts.length < 2) {
    return fallback;
  }
  const body = parts.slice(1).join('\\n\\n');
  const cleaned = body
    .replace(/=\\r?\\n/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(new RegExp('\\\\s+', 'g'), ' ')
    .trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.length > 20000 ? cleaned.slice(0, 20000) : cleaned;
}

function __mailflareReject(message, reason) {
  if (message && typeof message.setReject === 'function') {
    message.setReject(reason);
    return true;
  }
  return false;
}

function __mailflareExtractLocalPart(address) {
  const atIndex = address.indexOf('@');
  if (atIndex <= 0) return '';
  const localRaw = address.slice(0, atIndex);
  const plusIndex = localRaw.indexOf('+');
  const local = (plusIndex >= 0 ? localRaw.slice(0, plusIndex) : localRaw).trim();
  return local;
}

async function __mailflareResolveRecipient(db, recipient, authorativeDomain) {
  // 1. Exact match (email = recipient)
  const exact = await db
    .prepare('SELECT email FROM users WHERE lower(email) = ? LIMIT 1')
    .bind(recipient)
    .first();
  if (exact && exact.email) {
    return String(exact.email).trim().toLowerCase();
  }

  const localPart = __mailflareExtractLocalPart(recipient);
  if (!localPart) {
    return '';
  }

  // 2. Match by exact local-part (ignoring domain) — only if exactly one user has this local-part
  const localMatches = await db
    .prepare(
      'SELECT email ' +
        'FROM users ' +
        'WHERE password_hash IS NOT NULL ' +
        "AND lower(substr(email, 1, instr(email, '@') - 1)) = ? " +
        'ORDER BY created_at DESC, id DESC ' +
        'LIMIT 2'
    )
    .bind(localPart)
    .all();

  const results = (localMatches && localMatches.results) || [];
  if (results.length === 1) {
    return String(results[0].email || '').trim().toLowerCase();
  }

  // 3. Domain-corrected fallback: if we know the authoritative domain, try
  //    local-part@authoritativeDomain directly — handles domain typos in To: header.
  //    (message.to is the To: header, not SMTP RCPT TO which is inaccessible in CF Email Workers)
  if (authorativeDomain) {
    const correctedAddr = localPart + '@' + String(authorativeDomain).trim().toLowerCase();
    const corrected = await db
      .prepare('SELECT email FROM users WHERE lower(email) = ? LIMIT 1')
      .bind(correctedAddr)
      .first();
    if (corrected && corrected.email) {
      console.info(\`[mailflare-email] Resolved via domain-corrected fallback: \${recipient} → \${corrected.email} (domain typo in To: header)\`);
      return String(corrected.email).trim().toLowerCase();
    }
  }

  return '';
}

async function __mailflareHandleInboundEmail(message, env, ctx, worker) {
  const authorativeDomain = String((env && env.MAILFLARE_USER_DOMAIN) || __mailflareFallbackUserDomain || '').trim().toLowerCase();

  // CRITICAL: In Cloudflare Email Workers, message.to is an object (not a plain string) where:
  //   - toJSON() / JSON.stringify → SMTP envelope RCPT TO  (the correct address CF received)
  //   - toString() / String()    → formatted To: header    (may contain sender typos!)
  // We MUST use the JSON-serialized value to get the real envelope recipient.
  const toEnvelope = (() => {
    try {
      const v = message && message.to;
      if (!v) return '';
      // JSON round-trip: forces toJSON() path → gives envelope RCPT TO
      const parsed = JSON.parse(JSON.stringify(v));
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  })();

  const candidateRaw = [
    toEnvelope,                                              // SMTP envelope RCPT TO ← primary
    message && message.to,                                   // toString() → To: header (fallback)
    message && __mailflareGetHeader(message, 'delivered-to'),
    message && __mailflareGetHeader(message, 'x-original-to'),
    message && __mailflareGetHeader(message, 'x-forwarded-to')
  ];
  const candidates = candidateRaw
    .map((v) => __mailflareNormalizeAddress(v))
    .filter((v, i, arr) => v && arr.indexOf(v) === i); // unique, non-empty

  console.debug(\`[mailflare-email] envelope=\${JSON.stringify(toEnvelope)} toString=\${JSON.stringify(String(message && message.to || ''))} candidates=\${JSON.stringify(candidates)}\`);

  if (candidates.length === 0) {
    __mailflareReject(message, 'Invalid recipient');
    console.warn('[mailflare-email] Rejected inbound email: invalid recipient address.');
    return;
  }

  const db = env && env.DB;
  if (!db) {
    __mailflareReject(message, 'Recipient verification unavailable');
    console.warn('[mailflare-email] Rejected inbound email: DB binding is not available.');
    return;
  }

  // Try each candidate; domain-corrected fallback is tried inside resolveRecipient.
  let resolvedRecipient = '';
  let resolvedFrom = '';
  for (const candidate of candidates) {
    const resolved = await __mailflareResolveRecipient(db, candidate, authorativeDomain).catch(() => '');
    if (resolved) {
      resolvedRecipient = resolved;
      resolvedFrom = candidate;
      break;
    }
  }

  const recipient = resolvedFrom || candidates[0];

  if (!resolvedRecipient) {
    __mailflareReject(message, 'Unknown recipient');
    console.info(\`[mailflare-email] Dropped inbound email for unknown recipient: \${recipient} (tried: \${candidates.join(', ')}, domain: \${authorativeDomain || 'unknown'})\`);
    return;
  }

  if (resolvedFrom !== candidates[0]) {
    console.info(\`[mailflare-email] Resolved recipient via fallback header: \${resolvedFrom} → \${resolvedRecipient}\`);
  }

  const internalSecret = String((env && env.TELEGRAM_INTERNAL_SECRET) || '').trim();

  const sender = String((message && message.from) || '').trim();
  const recipientOriginal = String((message && message.to) || '').trim();
  const subject = __mailflareGetHeader(message, 'subject') || '(No Subject)';
  const contentType = __mailflareGetHeader(message, 'content-type');
  const headersJson = __mailflareHeadersToJson(message);
  const headerMessageId = __mailflareGetHeader(message, 'message-id');
  const receivedAt = new Date().toISOString();
  const emailId = __mailflareNormalizeMessageId(headerMessageId);
  const snippet = \`Inbound email from \${sender || '-'} to \${recipientOriginal || recipient || '-'} at \${receivedAt}\`;
  const rawMime = await __mailflareReadRawMime(message);
  const bodyText = __mailflareDeriveBodyText(rawMime, snippet);

  const payload = {
    emailId,
    sender,
    recipient: resolvedRecipient,
    subject,
    snippet,
    bodyText,
    receivedAt,
    rawMime,
    contentType,
    headersJson
  };

  const internalRequest = new Request('https://mailflare.internal/api/telegram/notify-email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mailflare-internal-request': '1',
      ...(internalSecret ? { 'x-mailflare-telegram-secret': internalSecret } : {})
    },
    body: JSON.stringify(payload)
  });

  if (worker && typeof worker.fetch === 'function') {
    try {
      const internalCtx = ctx && typeof ctx.waitUntil === 'function' ? ctx : { waitUntil() {} };
      const internalResponse = await worker.fetch(internalRequest, env, internalCtx);
      if (internalResponse.ok) {
        return;
      }

      const internalErrorText = await internalResponse.text().catch(() => '');
      console.error(
        \`[mailflare-email] Internal notify failed: \${internalResponse.status} \${internalResponse.statusText}\${internalErrorText ? \` :: \${internalErrorText}\` : ''}\`
      );
    } catch (error) {
      console.error(
        \`[mailflare-email] Internal notify exception: \${error instanceof Error ? error.message : String(error)}\`
      );
    }
  }

  const notifyUrl = __mailflareBuildNotifyUrl((env && env.MAILFLARE_NOTIFY_URL) || __mailflareFallbackNotifyUrl);
  if (!notifyUrl) {
    console.warn('[mailflare-email] MAILFLARE_NOTIFY_URL is not configured. Skip HTTP fallback notify.');
    return;
  }
  if (!internalSecret) {
    console.warn('[mailflare-email] TELEGRAM_INTERNAL_SECRET is not configured. Skip HTTP fallback notify.');
    return;
  }

  const response = await fetch(notifyUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mailflare-telegram-secret': internalSecret
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(
      \`[mailflare-email] HTTP fallback notify failed: \${response.status} \${response.statusText}\${errorText ? \` :: \${errorText}\` : ''}\`
    );
  }
}

const worker_with_email = {
  ...worker_default,
  async email(message, env, ctx) {
    ctx.waitUntil(__mailflareHandleInboundEmail(message, env, ctx, worker_default));
  }
};

export {
  worker_with_email as default
};
`;

const patched = source.replace(exportBlockPattern, injected);
writeFileSync(workerPath, patched, 'utf8');
