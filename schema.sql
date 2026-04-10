-- MailFlare Consolidated Migration
-- Run this once on a fresh database, or on existing (all IF NOT EXISTS / idempotent)
PRAGMA foreign_keys = ON;

-- ── Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Emails ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
  -- Identity & ownership
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Envelope
  message_id TEXT,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Mailbox state
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,

  -- Raw payload
  raw_size INTEGER,
  body_text TEXT,
  body_html TEXT,
  raw_mime TEXT NOT NULL,
  headers_json TEXT,

  -- Parsed threading
  parsed_message_id TEXT,
  parsed_in_reply_to TEXT,
  parsed_references TEXT,

  -- Parsed sender metadata
  parsed_from_name TEXT,
  parsed_from_email TEXT,
  parsed_sender TEXT,
  parsed_reply_to TEXT,
  parsed_delivered_to TEXT,
  parsed_return_path TEXT,

  -- Parsed recipient metadata
  parsed_to TEXT,
  parsed_cc TEXT,
  parsed_bcc TEXT,

  -- Parsed content
  parsed_subject TEXT,
  parsed_date TEXT,
  parsed_text TEXT,
  parsed_html TEXT,
  parsed_text_as_html TEXT,

  -- Parsed headers / attachments
  parsed_headers TEXT,
  parsed_attachments TEXT,
  parsed_has_attachments INTEGER NOT NULL DEFAULT 0,
  parsed_attachment_count INTEGER NOT NULL DEFAULT 0,

  -- Parsed security / transport metadata
  parsed_spam_score TEXT,
  parsed_auth_results TEXT,
  parsed_received_chain TEXT,
  parsed_content_type TEXT,
  parsed_charset TEXT,
  parsed_boundary TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ── Email Status History ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_status_history (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_id) REFERENCES emails(id)
);

-- ── Worker Metrics ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_metrics (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Worker Settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Access Codes (one-time gateway codes via Telegram /access) ─────────
CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- ── Access Sessions (from one-time access codes) ───────────────────────
CREATE TABLE IF NOT EXISTS access_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  code_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (code_id) REFERENCES access_codes(id)
);

-- ── Login Sessions (password-based login) ──────────────────────────────
CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT ''
);

-- ── Telegram Webhook Updates (dedup) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_webhook_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── API Keys ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

-- ── Indexes ────────────────────────────────────────────────────────────
-- Optimasi list inbox user yang memfilter Trash (deleted_at IS NULL + urutan)
CREATE INDEX IF NOT EXISTS idx_emails_user_inbox ON emails(user_id, deleted_at, received_at DESC);

-- Optimasi kalkulasi badge/unread/starred per-user
CREATE INDEX IF NOT EXISTS idx_emails_user_flags ON emails(user_id, deleted_at, is_read, is_starred, is_archived);

-- Optimasi metrik global dashboard (menghindari full table scan untuk aggregasi statistik)
CREATE INDEX IF NOT EXISTS idx_emails_global_metrics ON emails(deleted_at, is_read, is_starred, is_archived);

-- Hapus index lama yang tidak efisien 
DROP INDEX IF EXISTS idx_emails_user_received;
DROP INDEX IF EXISTS idx_emails_deleted;
CREATE INDEX IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_sessions_expires ON access_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_sessions_expires ON login_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id, expires_at DESC);

-- ── Cleanup (tables no longer used) ────────────────────────────────────
DROP INDEX IF EXISTS idx_telegram_events_user;
DROP TABLE IF EXISTS telegram_events;
