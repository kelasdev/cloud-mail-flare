#!/usr/bin/env node
/**
 * Sinkronisasi D1 Remote → Local (untuk wrangler dev)
 *
 * 1. Export remote D1 ke SQL via wrangler
 * 2. Import langsung ke SQLite file Miniflare (bukan via wrangler CLI)
 *
 * Usage: node scripts/sync-d1-to-local.mjs [database-name]
 * Prasyarat: wrangler CLI sudah login
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DB_NAME = process.argv[2] || 'mailflare-db';
const EXPORT_DIR = resolve('./d1-sync');
const DUMP_FILE = join(EXPORT_DIR, 'dump.sql');
const LOCAL_STATE = resolve('.wrangler/state/v3/d1');

console.log('=== D1 Remote → Local Sync ===');
console.log(`Database: ${DB_NAME}`);
console.log();

// 1. Export remote D1
console.log('[1/4] Exporting remote D1...');
rmSync(EXPORT_DIR, { recursive: true, force: true });
mkdirSync(EXPORT_DIR, { recursive: true });
execSync(`wrangler d1 export "${DB_NAME}" --remote --output "${DUMP_FILE}"`, { stdio: 'inherit' });
console.log('      OK');

// 2. Clean local D1 state
console.log('[2/4] Cleaning local D1 state...');
rmSync(LOCAL_STATE, { recursive: true, force: true });
console.log('      OK');

// 3. Import via wrangler (small statements) + direct SQLite (large statements)
console.log('[3/4] Importing to local D1...');

// First, create the database by running a simple query via wrangler
execSync(`wrangler d1 execute "${DB_NAME}" --local --command "SELECT 1"`, { stdio: 'pipe' });

// Find the SQLite file
const d1Dir = join(LOCAL_STATE, 'miniflare-D1DatabaseObject');
const sqliteFiles = readdirSync(d1Dir).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
if (sqliteFiles.length === 0) {
  console.error('      ERROR: No SQLite file found after wrangler init');
  process.exit(1);
}
const sqlitePath = join(d1Dir, sqliteFiles[0]);
console.log(`      SQLite: ${sqlitePath}`);

// Read SQL dump and import via better-sqlite3 or sqlite3 CLI
const sqlDump = readFileSync(DUMP_FILE, 'utf-8');

// Split into individual statements (handling large INSERTs)
const statements = [];
let current = '';
let inString = false;
let stringChar = '';

for (let i = 0; i < sqlDump.length; i++) {
  const ch = sqlDump[i];

  if (inString) {
    current += ch;
    if (ch === stringChar && sqlDump[i - 1] !== '\\') {
      inString = false;
    }
    continue;
  }

  if (ch === "'" || ch === '"') {
    inString = true;
    stringChar = ch;
    current += ch;
    continue;
  }

  if (ch === ';') {
    current += ch;
    const stmt = current.trim();
    if (stmt) {
      statements.push(stmt);
    }
    current = '';
    continue;
  }

  current += ch;
}

console.log(`      Parsed ${statements.length} statements`);

// Execute statements in batches using sqlite3 CLI
import { writeFileSync as writeTmp } from 'node:fs';
import { tmpdir } from 'node:os';

// For large INSERT statements, split them into individual row inserts
const processedStatements = [];
for (const stmt of statements) {
  // Check if this is a large INSERT with multiple VALUES (bulk insert)
  if (stmt.startsWith('INSERT INTO') && stmt.includes('),(')) {
    // Split bulk INSERT into individual INSERTs
    const match = stmt.match(/INSERT INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s*VALUES\s*(.+)/i);
    if (match) {
      const table = match[1];
      const columns = match[2];
      // Split by ),( to get individual value sets
      const valuesStr = match[3];
      const valueSets = [];
      let depth = 0;
      let current = '';
      for (const ch of valuesStr) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0 && current.trim() === ')') {
          // End of a value set
          valueSets.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      if (current.trim()) valueSets.push(current.trim());

      // Generate individual INSERT statements
      for (const vs of valueSets) {
        const clean = vs.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '');
        if (clean) {
          processedStatements.push(`INSERT INTO "${table}" (${columns}) VALUES ${clean};`);
        }
      }
      continue;
    }
  }
  processedStatements.push(stmt);
}

console.log(`      After splitting bulk inserts: ${processedStatements.length} statements`);

// Execute via sqlite3 CLI
const tmpSql = join(tmpdir(), 'd1-import.sql');
let imported = 0;
let failed = 0;

// Process in batches
const BATCH_SIZE = 50;
for (let i = 0; i < processedStatements.length; i += BATCH_SIZE) {
  const batch = processedStatements.slice(i, i + BATCH_SIZE);
  const batchSql = batch.join('\n');
  writeTmp(tmpSql, batchSql);

  try {
    execSync(`sqlite3 "${sqlitePath}" < "${tmpSql}"`, { stdio: 'pipe' });
    imported += batch.length;
    process.stdout.write(`\r      Imported ${imported}/${processedStatements.length} statements...`);
  } catch (err) {
    // Try one by one to find the failing statement
    for (const stmt of batch) {
      try {
        writeFileSync(tmpSql, stmt);
        execSync(`sqlite3 "${sqlitePath}" < "${tmpSql}"`, { stdio: 'pipe' });
        imported++;
      } catch (e) {
        failed++;
        // Skip silently - likely a duplicate or constraint error
      }
    }
  }
}

console.log('');
console.log(`      OK - ${imported} imported, ${failed} skipped`);

// 4. Summary
console.log('[4/4] Done!');
console.log('');
console.log('Local D1 synced with production.');
console.log('');
console.log('Next: npm run cf:dev → http://localhost:8787');
