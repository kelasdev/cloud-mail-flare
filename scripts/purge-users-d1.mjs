#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

function printHelp() {
  console.log(`
Purge Users from D1 (by email list)

Usage:
  node scripts/purge-users-d1.mjs [options]

Options:
  --file <path>        File berisi list user/email (contoh format: "1. user | user@domain")
  --emails <value>     List email (pisah koma/spasi/newline)
  --db-name <name>     Override D1 database name (default: baca dari wrangler.toml)
  --remote             Target remote D1 (default)
  --local              Target local D1
  --persist-to <path>  Directory persistence local (hanya untuk --local)
  --dry-run            Hanya preview (tidak delete)
  --yes                Skip prompt konfirmasi
  --help, -h           Show help

Input juga bisa dari stdin:
  cat list.txt | node scripts/purge-users-d1.mjs --dry-run

Contoh:
  node scripts/purge-users-d1.mjs --file ./list.txt --remote --dry-run
  node scripts/purge-users-d1.mjs --emails "a@x.id,b@x.id" --remote --yes
`.trim());
}

function parseArgs(argv) {
  const out = {
    file: '',
    emails: '',
    dbName: '',
    remote: true,
    local: false,
    persistTo: '',
    dryRun: false,
    yes: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? '');
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
    if (token === '--file') {
      out.file = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (token === '--emails') {
      out.emails = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (token === '--db-name') {
      out.dbName = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (token === '--persist-to') {
      out.persistTo = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (token === '--remote') {
      out.remote = true;
      out.local = false;
      continue;
    }
    if (token === '--local') {
      out.remote = false;
      out.local = true;
      continue;
    }
    if (token === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (token === '--yes') {
      out.yes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return out;
}

function getPnpmBin() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const display = `${command} ${args.join(' ')}`.trim();
    const child = spawn(command, args, {
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

    child.on('error', (error) => rejectPromise(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr, display });
        return;
      }
      const lines = [`Command failed: ${display}`, `Exit code: ${code}`];
      if (stdout.trim()) lines.push(`stdout:\n${stdout.trim()}`);
      if (stderr.trim()) lines.push(`stderr:\n${stderr.trim()}`);
      rejectPromise(new Error(lines.join('\n\n')));
    });
  });
}

function quotePs(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

async function readStdinIfAny() {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(String(chunk));
  }
  return chunks.join('');
}

function extractEmails(raw) {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = String(raw ?? '').match(emailPattern) ?? [];
  return Array.from(new Set(found.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInList(values) {
  return values.map(sqlQuote).join(', ');
}

async function readDefaultDatabaseName(cwd) {
  const wranglerPath = resolve(cwd, 'wrangler.toml');
  const content = await readFile(wranglerPath, 'utf8');
  const match = content.match(/database_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('Cannot detect database_name from wrangler.toml. Use --db-name.');
  }
  return match[1];
}

function parseWranglerJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const raw = String(stdout ?? '');
    const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // continue to throw below
      }
    }
    throw new Error(`Failed to parse wrangler JSON output.\n${stdout}`);
  }
}

async function runD1Command({ dbName, sql, remote, local, persistTo, cwd }) {
  const normalizedSql = String(sql ?? '').trim();
  if (process.platform === 'win32') {
    const parts = [
      'pnpm exec wrangler d1 execute',
      quotePs(dbName),
      '--json',
      '--command',
      quotePs(normalizedSql)
    ];
    if (remote) parts.push('--remote');
    if (local) parts.push('--local');
    if (persistTo) parts.push('--persist-to', quotePs(persistTo));

    const psCmd = parts.join(' ');
    const { stdout } = await runCommand('powershell', ['-NoProfile', '-Command', psCmd], { cwd });
    return parseWranglerJson(stdout);
  }

  const pnpm = getPnpmBin();
  const args = ['exec', 'wrangler', 'd1', 'execute', dbName, '--json', '--command', normalizedSql];
  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (persistTo) args.push('--persist-to', persistTo);
  const { stdout } = await runCommand(pnpm, args, { cwd });
  return parseWranglerJson(stdout);
}

async function runD1File({ dbName, filePath, remote, local, persistTo, cwd, streamOutput = false }) {
  if (process.platform === 'win32') {
    const parts = ['pnpm exec wrangler d1 execute', quotePs(dbName), '--file', quotePs(filePath)];
    if (remote) parts.push('--remote');
    if (local) parts.push('--local');
    if (persistTo) parts.push('--persist-to', quotePs(persistTo));
    const psCmd = parts.join(' ');
    return runCommand('powershell', ['-NoProfile', '-Command', psCmd], { cwd, streamOutput });
  }

  const pnpm = getPnpmBin();
  const args = ['exec', 'wrangler', 'd1', 'execute', dbName, '--file', filePath];
  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (persistTo) args.push('--persist-to', persistTo);
  return runCommand(pnpm, args, { cwd, streamOutput });
}

async function collectExistingEmails({ dbName, emails, remote, local, persistTo, cwd }) {
  const existing = new Set();
  const chunks = chunkArray(emails, 150);
  for (const batch of chunks) {
    const sql = `SELECT lower(email) AS email FROM users WHERE lower(email) IN (${buildInList(batch)}) ORDER BY email;`;
    const payload = await runD1Command({ dbName, sql, remote, local, persistTo, cwd });
    const rows = payload?.[0]?.results ?? [];
    for (const row of rows) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (email) existing.add(email);
    }
  }
  return Array.from(existing).sort();
}

function buildDeleteSql(emails) {
  const inList = buildInList(emails);
  return `
PRAGMA foreign_keys = ON;

DELETE FROM email_status_history
WHERE email_id IN (
  SELECT e.id
  FROM emails e
  JOIN users u ON u.id = e.user_id
  WHERE lower(u.email) IN (${inList})
);

DELETE FROM emails
WHERE user_id IN (
  SELECT id
  FROM users
  WHERE lower(email) IN (${inList})
);

DELETE FROM login_sessions
WHERE user_id IN (
  SELECT id
  FROM users
  WHERE lower(email) IN (${inList})
);

DELETE FROM users
WHERE lower(email) IN (${inList});
`.trim();
}

async function confirmDeletion(target, count) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = await rl.question(`Delete ${count} user(s) from ${target}? ketik "yes" untuk lanjut: `);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

async function main() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const dbName = args.dbName || (await readDefaultDatabaseName(cwd));

  const rawParts = [];
  if (args.file) {
    const filePath = resolve(cwd, args.file);
    rawParts.push(await readFile(filePath, 'utf8'));
  }
  if (args.emails) {
    rawParts.push(args.emails);
  }

  const stdinPayload = await readStdinIfAny();
  if (stdinPayload.trim()) {
    rawParts.push(stdinPayload);
  }

  const parsedEmails = extractEmails(rawParts.join('\n'));
  if (parsedEmails.length === 0) {
    throw new Error('Tidak ada email valid yang ditemukan. Gunakan --file, --emails, atau stdin.');
  }

  console.log(`[purge] target db: ${dbName}`);
  console.log(`[purge] mode: ${args.remote ? 'remote' : 'local'}`);
  console.log(`[purge] parsed emails: ${parsedEmails.length}`);

  const existing = await collectExistingEmails({
    dbName,
    emails: parsedEmails,
    remote: args.remote,
    local: args.local,
    persistTo: args.persistTo,
    cwd
  });

  console.log(`[purge] existing users found: ${existing.length}`);
  if (existing.length > 0) {
    for (const email of existing) {
      console.log(`  - ${email}`);
    }
  }

  if (existing.length === 0) {
    console.log('[purge] Nothing to delete.');
    return;
  }

  if (args.dryRun) {
    console.log('[purge] dry-run enabled, delete skipped.');
    return;
  }

  if (!args.yes) {
    if (!process.stdin.isTTY) {
      throw new Error('Non-interactive mode membutuhkan --yes untuk eksekusi delete.');
    }
    const ok = await confirmDeletion(args.remote ? 'REMOTE D1' : 'LOCAL D1', existing.length);
    if (!ok) {
      console.log('[purge] cancelled.');
      return;
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'cmf-purge-users-'));
  const sqlPath = join(tempDir, 'purge-users.sql');
  try {
    await writeFile(sqlPath, buildDeleteSql(existing), 'utf8');

    await runD1File({
      dbName,
      filePath: sqlPath,
      remote: args.remote,
      local: args.local,
      persistTo: args.persistTo,
      cwd,
      streamOutput: true
    });

    const verify = await runD1Command({
      dbName,
      sql: `SELECT COUNT(*) AS remaining_targets FROM users WHERE lower(email) IN (${buildInList(existing)});`,
      remote: args.remote,
      local: args.local,
      persistTo: args.persistTo,
      cwd
    });
    const remaining = Number(verify?.[0]?.results?.[0]?.remaining_targets ?? 0);
    if (remaining !== 0) {
      throw new Error(`Delete verification failed. remaining_targets=${remaining}`);
    }

    console.log(`[purge] success. deleted users: ${existing.length}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
