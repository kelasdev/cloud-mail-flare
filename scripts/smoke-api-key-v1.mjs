#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEFAULT_API_KEY = 'cmf_v1_smoke_key_ABC123XYZ_987654321';
const DEFAULT_PORT = 8797;
const HEALTH_PATH = '/api/health';
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 1_000;

function parseArgs(argv) {
  const out = {
    apiKey: DEFAULT_API_KEY,
    port: DEFAULT_PORT,
    skipBuild: false,
    databaseName: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--skip-build') {
      out.skipBuild = true;
      continue;
    }

    if (token === '--api-key') {
      out.apiKey = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }

    if (token === '--port') {
      const parsed = Number(argv[i + 1] ?? '');
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--port must be a positive integer');
      }
      out.port = parsed;
      i += 1;
      continue;
    }

    if (token === '--db-name') {
      out.databaseName = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return out;
}

function printHelp() {
  console.log(`
Smoke Test API Key + Public API v1

Usage:
  node scripts/smoke-api-key-v1.mjs [options]

Options:
  --api-key <value>    Override smoke API key (default: cmf_v1_smoke_key_ABC123XYZ_987654321)
  --port <number>      Wrangler dev port (default: 8797)
  --db-name <name>     D1 local database name (default: read from wrangler.toml)
  --skip-build         Skip "pnpm build" before smoke test
  --help               Show help
`.trim());
}

function getPnpmBin() {
  return process.platform === 'win32' ? 'pnpm' : 'pnpm';
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const invocation = resolveCommandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (options.streamOutput) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (options.streamOutput) {
        process.stderr.write(chunk);
      }
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const details = [
        `Command failed: ${invocation.display}`,
        `Exit code: ${code}`
      ];
      if (stdout.trim()) {
        details.push(`stdout:\n${stdout.trim()}`);
      }
      if (stderr.trim()) {
        details.push(`stderr:\n${stderr.trim()}`);
      }

      rejectPromise(new Error(details.join('\n\n')));
    });
  });
}

function startCommand(command, args, options = {}) {
  const invocation = resolveCommandInvocation(command, args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const log = {
    stdout: '',
    stderr: ''
  };

  child.stdout.on('data', (chunk) => {
    log.stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    log.stderr += String(chunk);
  });

  return { child, log, display: invocation.display };
}

async function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32' && child.pid) {
    await runCommand('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => null);
    return;
  }

  child.kill('SIGTERM');
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode !== null) {
      return;
    }
    await sleep(100);
  }

  child.kill('SIGKILL');
}

function resolveCommandInvocation(command, args) {
  if (process.platform !== 'win32') {
    return {
      command,
      args,
      display: `${command} ${args.join(' ')}`
    };
  }

  const cmdline = [command, ...args].map(quoteWindowsArg).join(' ');
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', cmdline],
    display: cmdline
  };
}

function quoteWindowsArg(value) {
  const raw = String(value ?? '');
  if (!raw) {
    return '""';
  }
  if (!/[\s"]/g.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/"/g, '\\"')}"`;
}

async function waitForServerReady(baseUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
        method: 'GET',
        signal: AbortSignal.timeout(2_500)
      });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore transient connection error while booting
    }

    await sleep(READY_POLL_MS);
  }

  throw new Error('Timed out waiting for wrangler dev to become ready');
}

async function callJson({ method, url, headers = {}, body }) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(8_000)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    body: json,
    raw: text
  };
}

async function readDefaultDatabaseName(cwd) {
  const path = resolve(cwd, 'wrangler.toml');
  const content = await readFile(path, 'utf8');
  const match = content.match(/database_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('Cannot detect database_name from wrangler.toml. Use --db-name.');
  }
  return match[1];
}

function buildSeedSql({ apiKey }) {
  const apiKeyHash = sha256Hex(apiKey);
  return `
DELETE FROM api_keys;
DELETE FROM emails;
DELETE FROM users;
INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
VALUES
  ('u-owner-1', 'owner@example.com', 'owner', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('u-member-1', 'memberone@example.com', 'memberone', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO api_keys (id, key_hash, name, created_by, created_at, revoked_at)
VALUES ('k-smoke-2', '${apiKeyHash}', 'smoke', 'smoke-test', CURRENT_TIMESTAMP, NULL);
INSERT INTO emails (
  id, user_id, message_id, sender, recipient, subject, snippet, received_at,
  is_read, is_starred, is_archived, raw_size, body_text, body_html, raw_mime,
  headers_json, parsed_message_id, parsed_subject, parsed_text, parsed_html,
  parsed_delivered_to, parsed_headers, parsed_date, parsed_content_type, parsed_charset, parsed_boundary
)
VALUES (
  'eml-smoke-1', 'u-member-1', 'eml-smoke-1', 'sender@example.net', 'memberone@example.com',
  'Smoke Subject', 'Smoke snippet preview', CURRENT_TIMESTAMP,
  0, 0, 0, 123,
  'Body text fallback', '<div><p>Parsed <strong>HTML</strong> content.</p><p>Line 2</p></div>',
  'From: sender@example.net\\nTo: memberone@example.com\\nSubject: Smoke Subject\\n\\nSmoke body',
  '{}', 'eml-smoke-1', 'Smoke Subject', 'Parsed text content', '<div><p>Parsed <strong>HTML</strong> content.</p><p>Line 2</p></div>',
  'memberone@example.com', '{}', CURRENT_TIMESTAMP, 'text/html; charset=utf-8', 'utf-8', ''
);
`.trim();
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.apiKey.trim();

  assertCondition(apiKey.startsWith('cmf_v1_'), 'API key must start with cmf_v1_');
  assertCondition(apiKey.length > 'cmf_v1_'.length + 20, 'API key token should be at least 20 chars');

  const databaseName = args.databaseName || (await readDefaultDatabaseName(cwd));
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const pnpmBin = getPnpmBin();

  console.log(`[smoke] Using database: ${databaseName}`);
  console.log(`[smoke] Using base URL: ${baseUrl}`);

  if (!args.skipBuild) {
    console.log('[smoke] Running build...');
    try {
      await runCommand(pnpmBin, ['exec', 'svelte-kit', 'sync'], { cwd, streamOutput: true });
      await runCommand(pnpmBin, ['exec', 'vite', 'build'], { cwd, streamOutput: true });
      await runCommand('node', ['./scripts/postbuild-add-email-handler.mjs'], { cwd, streamOutput: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lockError =
        message.includes('EPERM') &&
        (message.includes('.svelte-kit\\cloudflare') || message.includes('.svelte-kit/cloudflare'));

      if (!lockError) {
        throw error;
      }

      console.warn('[smoke] Build skipped due EPERM lock on .svelte-kit/cloudflare. Continuing with existing build output.');
    }
  } else {
    console.log('[smoke] Skip build enabled; refreshing route manifest with svelte-kit sync...');
    await runCommand(pnpmBin, ['exec', 'svelte-kit', 'sync'], { cwd });
  }

  console.log('[smoke] Applying schema...');
  await runCommand(pnpmBin, ['exec', 'wrangler', 'd1', 'execute', databaseName, '--local', '--file', './schema.sql'], { cwd });

  const tempDir = await mkdtemp(join(tmpdir(), 'cmf-smoke-'));
  const seedPath = join(tempDir, 'seed.sql');
  await writeFile(seedPath, buildSeedSql({ apiKey }), 'utf8');

  console.log('[smoke] Seeding data...');
  await runCommand(
    pnpmBin,
    ['exec', 'wrangler', 'd1', 'execute', databaseName, '--local', '--file', seedPath],
    { cwd }
  );

  const { child, log, display } = startCommand(
    pnpmBin,
    ['exec', 'wrangler', 'dev', '--local', '--port', String(args.port)],
    { cwd }
  );

  const results = [];
  try {
    console.log(`[smoke] Starting wrangler dev: ${display}`);
    await waitForServerReady(baseUrl);
    console.log('[smoke] Server ready.');

    const invalidKey = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/list_user?limit=5`,
      headers: {
        'x-api-key': 'cmf_v1_invalid_key_ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      }
    });
    assertCondition(invalidKey.status === 401, 'invalid key should return 401');
    assertCondition(invalidKey.body?.error?.code === 'UNAUTHORIZED', 'invalid key should return UNAUTHORIZED');
    results.push({ step: 'invalid_key_list_user', status: invalidKey.status, ok: true });

    const listBefore = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/list_user?limit=10&order=desc`,
      headers: {
        'x-api-key': apiKey
      }
    });
    assertCondition(listBefore.status === 200, 'list_user before should return 200');
    assertCondition(Number(listBefore.body?.data?.total ?? 0) === 2, 'list_user before should have total=2');
    results.push({ step: 'list_user_before', status: listBefore.status, ok: true });

    const createUser = await callJson({
      method: 'POST',
      url: `${baseUrl}/api/public/v1/create_user`,
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ username: 'apitest' })
    });
    assertCondition(createUser.status === 201, 'create_user should return 201');
    assertCondition(createUser.body?.ok === true, 'create_user should return ok=true');
    assertCondition(String(createUser.body?.data?.credentials?.email ?? '').includes('@'), 'create_user should return credentials email');
    results.push({ step: 'create_user', status: createUser.status, ok: true });

    const listAfter = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/list_user?limit=10&order=desc`,
      headers: {
        'x-api-key': apiKey
      }
    });
    assertCondition(listAfter.status === 200, 'list_user after should return 200');
    assertCondition(Number(listAfter.body?.data?.total ?? 0) === 3, 'list_user after should have total=3');
    results.push({ step: 'list_user_after', status: listAfter.status, ok: true });

    const userMailbox = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/user_mailbox?username=memberone&limit=5`,
      headers: {
        'x-api-key': apiKey
      }
    });
    assertCondition(userMailbox.status === 200, 'user_mailbox should return 200');
    assertCondition(userMailbox.body?.data?.user?.username === 'memberone', 'user_mailbox should resolve username');
    assertCondition(Array.isArray(userMailbox.body?.data?.emails), 'user_mailbox should return emails array');
    results.push({ step: 'user_mailbox', status: userMailbox.status, ok: true });

    const readEmail = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/read_email?email_id=eml-smoke-1`,
      headers: {
        'x-api-key': apiKey
      }
    });
    assertCondition(readEmail.status === 200, 'read_email should return 200');
    assertCondition(typeof readEmail.body?.data?.renderedContent === 'string', 'read_email should return renderedContent');
    assertCondition(readEmail.body?.data?.renderedSource === 'parsed_html', 'read_email should return renderedSource=parsed_html');
    results.push({ step: 'read_email', status: readEmail.status, ok: true });

    const readEmaiAlias = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/public/v1/read_emai?email_id=eml-smoke-1`,
      headers: {
        'x-api-key': apiKey
      }
    });
    assertCondition(readEmaiAlias.status === 200, 'read_emai alias should return 200');
    assertCondition(
      typeof readEmaiAlias.body?.data?.renderedContent === 'string',
      'read_emai alias should return renderedContent'
    );
    results.push({ step: 'read_emai_alias', status: readEmaiAlias.status, ok: true });

    const adminNoSession = await callJson({
      method: 'GET',
      url: `${baseUrl}/api/worker-settings/api-key`
    });
    assertCondition(adminNoSession.status === 401, 'admin api key endpoint without session should return 401');
    results.push({ step: 'admin_api_key_without_session', status: adminNoSession.status, ok: true });

    console.log('[smoke] PASS');
    for (const item of results) {
      console.log(`[smoke] ${item.step}: status=${item.status}`);
    }
  } catch (error) {
    console.error('[smoke] FAIL');
    for (const item of results) {
      console.error(`[smoke] ${item.step}: status=${item.status}`);
    }
    if (log.stdout.trim()) {
      console.error('\n[wrangler stdout]');
      console.error(log.stdout.trim());
    }
    if (log.stderr.trim()) {
      console.error('\n[wrangler stderr]');
      console.error(log.stderr.trim());
    }
    throw error;
  } finally {
    await stopProcess(child);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
