import type {
  DashboardDto,
  DashboardMetricDto,
  DashboardWorkerStatus,
  EmailDetailDto,
  EmailDto,
  UserDto
} from '$lib/types/dto';
import type { WorkerSettingsPageDto } from '$lib/server/services/worker-settings.service';
import PostalMime from 'postal-mime';

interface CreateUserInput {
  email: string;
  displayName?: string;
  passwordHash?: string;
  telegramEnabled?: boolean;
}

interface UpdateUserInput {
  email?: string;
  displayName?: string;
  passwordHash?: string;
  telegramEnabled?: boolean;
}

interface WorkerSettingsUpdateInput {
  botToken?: string;
  webhookSecret?: string;
  allowedIds?: string;
  forwardInbound?: boolean;
  targetMode?: string;
  defaultChatId?: string;
  testChatId?: string;
}

interface UpsertInboundEmailInput {
  emailId: string;
  sender: string;
  recipient: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  receivedAt?: string;
  rawMime?: string;
  contentType?: string;
  headersJson?: string;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
}

export interface DeleteUserResult {
  deleted: boolean;
  reason?: 'not_found' | 'has_dependencies';
  emailCount?: number;
  loginSessionCount?: number;
}

export interface SoftDeleteUserResult {
  deleted: boolean;
  reason?: 'not_found' | 'already_deleted' | 'protected_owner';
}

export type EmailQuickAction = 'star' | 'archive' | 'delete';

type EmailQuickActionReason = 'not_found' | 'already_archived' | 'already_deleted';

export interface EmailActionState {
  id: string;
  userId: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  deletedAt: string | null;
}

export interface ApplyEmailQuickActionResult {
  updated: boolean;
  reason?: EmailQuickActionReason;
  email?: EmailActionState;
}

let telegramEnabledColumnExists: boolean | null = null;

async function hasTelegramEnabledColumn(db: D1Database): Promise<boolean> {
  if (telegramEnabledColumnExists !== null) {
    return telegramEnabledColumnExists;
  }
  try {
    const result = await db
      .prepare("PRAGMA table_info(users)")
      .all<{ name: string }>();
    const columns = (result.results ?? []).map((r) => r.name);
    telegramEnabledColumnExists = columns.includes('telegram_enabled');
  } catch {
    telegramEnabledColumnExists = false;
  }
  return telegramEnabledColumnExists;
}

function telegramColumnFragment(hasColumn: boolean): string {
  return hasColumn ? 'u.telegram_enabled,' : '1 AS telegram_enabled,';
}

export async function getDashboardOverview(db?: D1Database): Promise<DashboardDto> {
  if (!db) {
    return dashboardOverviewFallback;
  }

  const hasCol = await hasTelegramEnabledColumn(db);
  const telegramCol = telegramColumnFragment(hasCol);

  const [
    usersCount,
    telegramEnabledCount,
    telegramDisabledCount,
    topActiveRows,
    pipelineTotals,
    withAttachmentsCount,
    storageAgg,
    receivedTodayCount,
    received7dCount,
    activeLoginSessions,
    activeApiKeys,
    pendingAccessCodes,
    telegramUpdates24h,
    emailsLastHour,
    recentActivityRows
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    db
      .prepare(
        hasCol
          ? 'SELECT COUNT(*) AS count FROM users WHERE telegram_enabled = 1'
          : 'SELECT COUNT(*) AS count FROM users'
      )
      .first<{ count: number }>(),
    db
      .prepare(
        hasCol
          ? 'SELECT COUNT(*) AS count FROM users WHERE telegram_enabled = 0'
          : 'SELECT 0 AS count'
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `WITH owner AS (
            SELECT id AS owner_id
            FROM users
            ORDER BY created_at ASC, id ASC
            LIMIT 1
          )
          SELECT
            u.id,
            u.email,
            COALESCE(u.display_name, u.email) AS display_name,
            ${telegramCol}
            CASE
              WHEN u.id = (SELECT owner_id FROM owner) THEN 'owner'
              ELSE 'member'
            END AS role
            ,
            COUNT(e.id) AS total_emails,
            SUM(CASE WHEN e.is_read = 0 AND e.deleted_at IS NULL THEN 1 ELSE 0 END) AS unread_emails
          FROM users u
          LEFT JOIN emails e ON e.user_id = u.id AND e.deleted_at IS NULL
          GROUP BY u.id, u.email, u.display_name, u.password_hash
          ORDER BY total_emails DESC, u.created_at DESC, u.id DESC
          LIMIT 5`
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN is_read = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS read_count,
           SUM(CASE WHEN is_read = 0 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS unread_count,
           SUM(CASE WHEN is_starred = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS starred_count,
           SUM(CASE WHEN is_archived = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS archived_count,
           SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_count
         FROM emails`
      )
      .first<{
        total: number;
        read_count: number;
        unread_count: number;
        starred_count: number;
        archived_count: number;
        deleted_count: number;
      }>(),
    db
      .prepare('SELECT COUNT(*) AS count FROM emails WHERE parsed_has_attachments = 1 AND deleted_at IS NULL')
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(raw_size), 0) AS total_bytes,
           COALESCE(AVG(raw_size), 0) AS avg_bytes
         FROM emails
         WHERE deleted_at IS NULL`
      )
      .first<{ total_bytes: number; avg_bytes: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM emails
         WHERE received_at >= datetime('now', 'start of day')`
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM emails
         WHERE received_at >= datetime('now', '-7 days')`
      )
      .first<{ count: number }>(),
    db
      .prepare('SELECT COUNT(*) AS count FROM login_sessions WHERE expires_at > datetime(\'now\')')
      .first<{ count: number }>(),
    db
      .prepare('SELECT COUNT(*) AS count FROM api_keys WHERE revoked_at IS NULL')
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM access_codes
         WHERE used_at IS NULL AND expires_at > datetime('now')`
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM telegram_webhook_updates
         WHERE processed_at >= datetime('now', '-1 day')`
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM emails
         WHERE received_at >= datetime('now', '-1 hour')`
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT
           h.id,
           h.action,
           h.actor,
           h.from_state,
           h.to_state,
           h.created_at,
           e.subject AS email_subject
         FROM email_status_history h
         LEFT JOIN emails e ON e.id = h.email_id
         ORDER BY h.created_at DESC, h.id DESC
         LIMIT 5`
      )
      .all<Record<string, unknown>>()
  ]);

  const totalEmails = Number(pipelineTotals?.total ?? 0);
  const unreadCount = Number(pipelineTotals?.unread_count ?? 0);
  const starredCount = Number(pipelineTotals?.starred_count ?? 0);
  const archivedCount = Number(pipelineTotals?.archived_count ?? 0);
  const deletedCount = Number(pipelineTotals?.deleted_count ?? 0);
  const readCount = Number(pipelineTotals?.read_count ?? 0);

  const totalBytes = Number(storageAgg?.total_bytes ?? 0);
  const avgBytes = Number(storageAgg?.avg_bytes ?? 0);
  const totalSizeMb = totalBytes / (1024 * 1024);
  const averageSizeKb = avgBytes / 1024;

  const usersTotal = Number(usersCount?.count ?? 0);
  const telegramEnabled = Number(telegramEnabledCount?.count ?? 0);
  const telegramDisabled = Number(telegramDisabledCount?.count ?? 0);

  const worker: DashboardWorkerStatus =
    Number(emailsLastHour?.count ?? 0) > 0 || totalEmails > 0 ? 'operational' : 'degraded';

  const metrics: DashboardMetricDto[] = [
    {
      key: 'users',
      label: 'Registered Users',
      value: formatNumber(usersTotal),
      hint: `${formatNumber(telegramEnabled)} telegram aktif`,
      status: 'ok',
      tone: 'primary',
      icon: 'group'
    },
    {
      key: 'emails',
      label: 'Email Records',
      value: formatNumber(totalEmails),
      hint: `${formatNumber(received7dCount?.count ?? 0)} 7 hari terakhir`,
      delta: `+${formatNumber(receivedTodayCount?.count ?? 0)} hari ini`,
      status: 'ok',
      tone: 'primary',
      icon: 'mail'
    },
    {
      key: 'unread',
      label: 'Unread Inbox Items',
      value: formatNumber(unreadCount),
      hint: unreadCount > 0 ? 'Perlu ditinjau' : 'Semua sudah terbaca',
      status: unreadCount > 0 ? 'warning' : 'ok',
      tone: 'warning',
      icon: 'mark_email_unread'
    },
    {
      key: 'starred',
      label: 'Starred by Admin',
      value: formatNumber(starredCount),
      hint: 'Disimpan permanen',
      status: 'ok',
      tone: 'success',
      icon: 'star'
    },
    {
      key: 'archived',
      label: 'Archived',
      value: formatNumber(archivedCount),
      hint: 'Dipindahkan dari inbox',
      status: 'ok',
      tone: 'neutral',
      icon: 'archive'
    },
    {
      key: 'deleted',
      label: 'Soft Deleted',
      value: formatNumber(deletedCount),
      hint: 'Dalam masa retensi',
      status: deletedCount > 0 ? 'critical' : 'ok',
      tone: 'danger',
      icon: 'delete'
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    pipeline: {
      total: totalEmails,
      read: readCount,
      unread: unreadCount,
      starred: starredCount,
      archived: archivedCount,
      deleted: deletedCount,
      withAttachments: Number(withAttachmentsCount?.count ?? 0),
      averageSizeKb: Number(averageSizeKb.toFixed(1)),
      totalSizeMb: Number(totalSizeMb.toFixed(2)),
      receivedToday: Number(receivedTodayCount?.count ?? 0),
      receivedLast7Days: Number(received7dCount?.count ?? 0)
    },
    users: {
      total: usersTotal,
      telegramEnabled,
      telegramDisabled,
      topActive: (topActiveRows.results ?? []).map((row) => ({
        id: String(row.id),
        displayName: String(row.display_name ?? row.email),
        email: String(row.email),
        role: String(row.role ?? 'member') === 'owner' ? 'owner' : 'member',
        telegramEnabled: Number(row.telegram_enabled ?? 1) === 1,
        totalEmails: Number(row.total_emails ?? 0),
        unreadEmails: Number(row.unread_emails ?? 0)
      }))
    },
    system: {
      worker,
      activeLoginSessions: Number(activeLoginSessions?.count ?? 0),
      activeApiKeys: Number(activeApiKeys?.count ?? 0),
      pendingAccessCodes: Number(pendingAccessCodes?.count ?? 0),
      telegramUpdatesLast24h: Number(telegramUpdates24h?.count ?? 0),
      emailsLastHour: Number(emailsLastHour?.count ?? 0)
    },
    recentActivity: (recentActivityRows.results ?? []).map((row) => ({
      id: String(row.id),
      action: String(row.action ?? ''),
      actor: String(row.actor ?? 'system'),
      fromState: String(row.from_state ?? ''),
      toState: String(row.to_state ?? ''),
      createdAt: String(row.created_at ?? '')
    }))
  };
}

export async function getUsersFromDb(db?: D1Database): Promise<UserDto[]> {
  if (!db) {
    return usersFallback;
  }

  const hasCol = await hasTelegramEnabledColumn(db);
  const telegramCol = telegramColumnFragment(hasCol);

  const query = `
    WITH owner AS (
      SELECT id AS owner_id
      FROM users
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    )
    SELECT
      u.id,
      u.email,
      COALESCE(u.display_name, u.email) AS display_name,
      ${telegramCol}
      CASE
        WHEN u.id = (SELECT owner_id FROM owner) THEN 'owner'
        ELSE 'member'
      END AS role
      ,
      CASE
        WHEN u.password_hash IS NULL THEN 'disabled'
        ELSE 'active'
      END AS status,
      COUNT(e.id) AS total_emails,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) AS unread_emails
    FROM users u
    LEFT JOIN emails e
      ON e.user_id = u.id
      AND e.deleted_at IS NULL
    GROUP BY u.id, u.email, u.display_name, u.password_hash
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 100
  `;
  const { results } = await db.prepare(query).all<Record<string, unknown>>();
  return (results ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: String(row.role ?? 'member'),
    status: String(row.status ?? 'active') === 'disabled' ? 'disabled' : 'active',
    telegramEnabled: Number(row.telegram_enabled ?? 1) === 1,
    totalEmails: Number(row.total_emails ?? 0),
    unreadEmails: Number(row.unread_emails ?? 0)
  }));
}

export async function getUserByIdFromDb(db: D1Database | undefined, userId: string): Promise<UserDto | null> {
  if (!db) {
    return usersFallback.find((user) => user.id === userId) ?? null;
  }

  const hasCol = await hasTelegramEnabledColumn(db);
  const telegramCol = telegramColumnFragment(hasCol);

  const row = await db
    .prepare(
      `
      WITH owner AS (
        SELECT id AS owner_id
        FROM users
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      )
      SELECT
        u.id,
        u.email,
        COALESCE(u.display_name, u.email) AS display_name,
        ${telegramCol}
        CASE
          WHEN u.id = (SELECT owner_id FROM owner) THEN 'owner'
          ELSE 'member'
        END AS role,
        CASE
          WHEN u.password_hash IS NULL THEN 'disabled'
          ELSE 'active'
        END AS status,
        (
          SELECT COUNT(*)
          FROM emails e
          WHERE e.user_id = u.id
            AND e.deleted_at IS NULL
        ) AS total_emails,
        (
          SELECT COUNT(*)
          FROM emails e
          WHERE e.user_id = u.id
            AND e.deleted_at IS NULL
            AND e.is_read = 0
        ) AS unread_emails
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `
    )
    .bind(userId)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: String(row.role ?? 'member'),
    status: String(row.status ?? 'active') === 'disabled' ? 'disabled' : 'active',
    telegramEnabled: Number(row.telegram_enabled ?? 1) === 1,
    totalEmails: Number(row.total_emails ?? 0),
    unreadEmails: Number(row.unread_emails ?? 0)
  };
}

export async function getUserByEmailFromDb(db: D1Database | undefined, email: string): Promise<UserDto | null> {
  if (!db) {
    return usersFallback.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  const hasCol = await hasTelegramEnabledColumn(db);
  const telegramCol = telegramColumnFragment(hasCol);

  const row = await db
    .prepare(
      `
      WITH owner AS (
        SELECT id AS owner_id
        FROM users
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      )
      SELECT
        u.id,
        u.email,
        COALESCE(u.display_name, u.email) AS display_name,
        ${telegramCol}
        CASE
          WHEN u.id = (SELECT owner_id FROM owner) THEN 'owner'
          ELSE 'member'
        END AS role,
        CASE
          WHEN u.password_hash IS NULL THEN 'disabled'
          ELSE 'active'
        END AS status
      FROM users u
      WHERE lower(u.email) = lower(?)
      LIMIT 1
    `
    )
    .bind(email)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: String(row.role ?? 'member'),
    status: String(row.status ?? 'active') === 'disabled' ? 'disabled' : 'active',
    telegramEnabled: Number(row.telegram_enabled ?? 1) === 1
  };
}

export async function getUserAuthByEmail(db: D1Database | undefined, email: string): Promise<AuthUserRecord | null> {
  if (!db) {
    return null;
  }

  const row = await db
    .prepare(
      `
      SELECT
        id,
        email,
        COALESCE(display_name, email) AS display_name,
        password_hash
      FROM users
      WHERE lower(email) = lower(?)
      LIMIT 1
    `
    )
    .bind(email)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    passwordHash: row.password_hash ? String(row.password_hash) : null
  };
}

export async function upsertInboundEmailInDb(
  db: D1Database | undefined,
  input: UpsertInboundEmailInput
): Promise<{ stored: boolean; reason?: string }> {
  if (!db) {
    throw new Error('DB binding is required for inbound email upsert');
  }

  const emailId = input.emailId.trim();
  const sender = input.sender.trim();
  const recipient = input.recipient.trim().toLowerCase();
  if (!emailId || !sender || !recipient) {
    return { stored: false, reason: 'invalid_input' };
  }

  const userRow = await db
    .prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
    .bind(recipient)
    .first<{ id: string | null }>();
  const userId = String(userRow?.id ?? '').trim();
  if (!userId) {
    return { stored: false, reason: 'recipient_not_found' };
  }

  const subject = (input.subject?.trim() || '(No Subject)').slice(0, 998);
  const snippet = (
    input.snippet?.trim() ||
    `Inbound email from ${sender} to ${recipient} at ${new Date().toISOString()}`
  ).slice(0, 2000);
  const rawMimeInput = normalizeRawMimeInput(input.rawMime ?? '');
  const rawMime =
    rawMimeInput.trim() ||
    `From: ${sender}\nTo: ${recipient}\nSubject: ${subject}\nDate: ${new Date().toUTCString()}\n\n${snippet}`;
  const contentType = (input.contentType?.trim() || '').slice(0, 255);
  const headersJson = (input.headersJson?.trim() || '').slice(0, 30000);
  const headers = parseHeadersJson(headersJson);
  const contentTypeHeader = pickHeader(headers, 'content-type') || contentType;
  const transferEncodingHeader = pickHeader(headers, 'content-transfer-encoding');
  const fromHeader = pickHeader(headers, 'from') || sender;
  const toHeader = pickHeader(headers, 'to') || recipient;
  const ccHeader = pickHeader(headers, 'cc');
  const bccHeader = pickHeader(headers, 'bcc');
  const replyToHeader = pickHeader(headers, 'reply-to');
  const senderHeader = pickHeader(headers, 'sender');
  const returnPathHeader = pickHeader(headers, 'return-path');
  const inReplyToHeader = pickHeader(headers, 'in-reply-to');
  const referencesHeader = pickHeader(headers, 'references');
  const authResultsHeader = pickHeader(headers, 'authentication-results');
  const spamScoreHeader = pickHeader(headers, 'x-spam-score');
  const receivedChainHeader = pickHeader(headers, 'received');
  const dateHeader = pickHeader(headers, 'date') || input.receivedAt || '';
  const fromMailbox = parseMailboxHeader(fromHeader);
  const senderMailbox = parseMailboxHeader(senderHeader);
  const replyToMailbox = parseMailboxHeader(replyToHeader);
  const returnPathMailbox = parseMailboxHeader(returnPathHeader);
  const parsedCharset = parseHeaderParam(contentTypeHeader, 'charset').slice(0, 120);
  const parsedBoundary = parseHeaderParam(contentTypeHeader, 'boundary').slice(0, 255);
  const parser = new PostalMime();
  let parsedMimeHtml = '';
  let parsedMimeText = '';
  try {
    const parsedMime = await parser.parse(rawMime);
    parsedMimeHtml = parsedMime.html || '';
    parsedMimeText = parsedMime.text || (parsedMimeHtml ? htmlToPlainText(parsedMimeHtml) : '');
  } catch {
    parsedMimeHtml = '';
    parsedMimeText = '';
  }
  const fallbackMime = extractBestBodyFromRawMime(rawMime, contentTypeHeader, transferEncodingHeader, parsedBoundary);
  const preferFallback = looksLikeRawMimeLeak(parsedMimeText, parsedBoundary);
  const resolvedHtml = preferFallback ? fallbackMime.html || parsedMimeHtml : parsedMimeHtml || fallbackMime.html;
  const resolvedText = preferFallback
    ? fallbackMime.text || (resolvedHtml ? htmlToPlainText(resolvedHtml) : '')
    : parsedMimeText || fallbackMime.text || (resolvedHtml ? htmlToPlainText(resolvedHtml) : '');

  const parsedHtml = resolvedHtml.slice(0, 50000);
  const parsedText = resolvedText;
  const bodyText = (parsedText || input.bodyText?.trim() || snippet).slice(0, 20000);
  const parsedTextAsHtml = parsedHtml ? '' : textToSimpleHtml(bodyText).slice(0, 50000);
  const rawSize = rawMime.length;
  const receivedAt = input.receivedAt?.trim() || new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO emails (
        id,
        user_id,
        message_id,
        sender,
        recipient,
        subject,
        snippet,
        received_at,
        is_read,
        is_starred,
        is_archived,
        raw_size,
        body_text,
        raw_mime,
        headers_json,
        parsed_message_id,
        parsed_from_email,
        parsed_subject,
        parsed_text,
        parsed_delivered_to,
        parsed_headers,
        parsed_date,
        parsed_content_type,
        parsed_charset,
        parsed_boundary
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        sender = excluded.sender,
        recipient = excluded.recipient,
        subject = excluded.subject,
        snippet = excluded.snippet,
        body_text = excluded.body_text,
        raw_size = excluded.raw_size,
        raw_mime = excluded.raw_mime,
        headers_json = excluded.headers_json,
        parsed_message_id = excluded.parsed_message_id,
        parsed_from_email = excluded.parsed_from_email,
        parsed_subject = excluded.parsed_subject,
        parsed_text = excluded.parsed_text,
        parsed_delivered_to = excluded.parsed_delivered_to,
        parsed_headers = excluded.parsed_headers,
        parsed_date = excluded.parsed_date,
        parsed_content_type = excluded.parsed_content_type,
        parsed_charset = excluded.parsed_charset,
        parsed_boundary = excluded.parsed_boundary
    `
    )
    .bind(
      emailId,
      userId,
      emailId,
      sender,
      recipient,
      subject,
      snippet,
      dateHeader || receivedAt,
      rawSize,
      bodyText,
      rawMime,
      headersJson,
      emailId,
      sender,
      subject,
      bodyText,
      recipient,
      headersJson,
      receivedAt,
      contentTypeHeader,
      parsedCharset,
      parsedBoundary
    )
    .run();

  await db
    .prepare(
      `
      UPDATE emails
      SET
        parsed_in_reply_to = ?,
        parsed_references = ?,
        parsed_from_name = ?,
        parsed_from_email = ?,
        parsed_sender = ?,
        parsed_reply_to = ?,
        parsed_return_path = ?,
        parsed_to = ?,
        parsed_cc = ?,
        parsed_bcc = ?,
        parsed_html = ?,
        parsed_text_as_html = ?,
        parsed_spam_score = ?,
        parsed_auth_results = ?,
        parsed_received_chain = ?
      WHERE id = ?
    `
    )
    .bind(
      truncateNullable(inReplyToHeader, 998),
      truncateNullable(referencesHeader, 5000),
      truncateNullable(fromMailbox.name, 255),
      truncateNullable(fromMailbox.email || sender, 320),
      truncateNullable(senderMailbox.email || senderHeader, 320),
      truncateNullable(replyToMailbox.email || replyToHeader, 320),
      truncateNullable(returnPathMailbox.email || returnPathHeader, 320),
      truncateNullable(toHeader, 2000),
      truncateNullable(ccHeader, 2000),
      truncateNullable(bccHeader, 2000),
      truncateNullable(parsedHtml, 50000),
      truncateNullable(parsedTextAsHtml, 50000),
      truncateNullable(spamScoreHeader, 120),
      truncateNullable(authResultsHeader, 5000),
      truncateNullable(receivedChainHeader, 30000),
      emailId
    )
    .run();

  return { stored: true };
}

function parseHeaderParam(contentType: string, paramName: string): string {
  if (!contentType) {
    return '';
  }
  const regex = new RegExp(`${paramName}\\s*=\\s*("?)([^";\\r\\n]+)\\1`, 'i');
  const match = contentType.match(regex);
  return match ? String(match[2] ?? '').trim() : '';
}

function parseHeadersJson(headersJson: string): Record<string, string> {
  if (!headersJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[String(key).toLowerCase()] = String(value ?? '');
    }
    return out;
  } catch {
    return {};
  }
}

function pickHeader(headers: Record<string, string>, name: string): string {
  return String(headers[name.toLowerCase()] ?? '').trim();
}

function normalizeAddressFromHeader(value: string): string {
  const trimmed = value.replace(/\\"/g, '"').trim();
  const angle = trimmed.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : trimmed).trim();
  return addr.replace(/^"+|"+$/g, '');
}

function parseMailboxHeader(value: string): { name: string; email: string } {
  const trimmed = value.replace(/\\"/g, '"').trim();
  if (!trimmed) {
    return { name: '', email: '' };
  }
  const angle = trimmed.match(/^(.*)<([^>]+)>/);
  if (angle) {
    const name = angle[1].trim().replace(/^"+|"+$/g, '').trim();
    const email = normalizeAddressFromHeader(angle[2]).toLowerCase();
    return { name, email };
  }
  const plain = normalizeAddressFromHeader(trimmed).toLowerCase();
  if (plain.includes('@')) {
    return { name: '', email: plain };
  }
  return { name: trimmed, email: '' };
}

function normalizeRawMimeInput(rawMime: string): string {
  const value = String(rawMime ?? '');
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string' && parsed.trim()) {
        return parsed;
      }
    } catch {
      // ignore malformed JSON-string payload and use the original value
    }
  }

  if (!value.includes('\n') && (trimmed.includes('\\r\\n') || trimmed.includes('\\n'))) {
    return trimmed.replace(/\\r\\n/g, '\r\n').replace(/\\n/g, '\n');
  }

  return value;
}

function looksLikeRawMimeLeak(value: string, boundary: string): boolean {
  const sample = String(value ?? '').slice(0, 2500);
  if (!sample) {
    return false;
  }

  if (/^\s*--[-_=a-zA-Z0-9]{6,}/m.test(sample) && /content-type\s*:/i.test(sample)) {
    return true;
  }

  if (/content-transfer-encoding\s*:/i.test(sample) && /mime-version\s*:/i.test(sample)) {
    return true;
  }

  if (boundary) {
    const normalizedBoundary = boundary.replace(/^"+|"+$/g, '');
    if (normalizedBoundary && (sample.includes(normalizedBoundary) || sample.includes(`--${normalizedBoundary}`))) {
      if (/content-type\s*:/i.test(sample)) {
        return true;
      }
    }
  }

  return false;
}

function extractBestBodyFromRawMime(
  rawMime: string,
  contentTypeHeader: string,
  transferEncodingHeader: string,
  boundary: string
): { text: string; html: string } {
  const rawBody = extractRawBodyFromMime(rawMime);
  if (!rawBody) {
    return { text: '', html: '' };
  }

  const normalizedContentType = contentTypeHeader.toLowerCase();
  const boundaryValue = boundary || parseHeaderParam(contentTypeHeader, 'boundary');
  if (normalizedContentType.includes('multipart/') && boundaryValue) {
    const parts = splitMultipartBody(rawBody, boundaryValue);
    let plainText = '';
    let htmlBody = '';

    for (const part of parts) {
      const parsedPart = parseMimePart(part);
      if (!parsedPart) {
        continue;
      }

      const partContentType = pickHeader(parsedPart.headers, 'content-type').toLowerCase();
      const partEncoding = pickHeader(parsedPart.headers, 'content-transfer-encoding') || transferEncodingHeader;
      const decodedBody = decodeTransferEncoding(parsedPart.body, partEncoding).trim();
      if (!decodedBody) {
        continue;
      }

      if (!plainText && partContentType.includes('text/plain')) {
        plainText = decodedBody;
      }
      if (!htmlBody && partContentType.includes('text/html')) {
        htmlBody = decodedBody;
      }
      if (plainText && htmlBody) {
        break;
      }
    }

    if (plainText || htmlBody) {
      return {
        text: plainText || htmlToPlainText(htmlBody),
        html: htmlBody
      };
    }
  }

  const decodedBody = decodeTransferEncoding(rawBody, transferEncodingHeader).trim();
  if (!decodedBody) {
    return { text: '', html: '' };
  }

  if (normalizedContentType.includes('text/html')) {
    return {
      text: htmlToPlainText(decodedBody),
      html: decodedBody
    };
  }

  return {
    text: decodedBody,
    html: ''
  };
}

function splitMultipartBody(rawBody: string, boundary: string): string[] {
  const normalizedBoundary = String(boundary ?? '').replace(/^"+|"+$/g, '').trim();
  if (!normalizedBoundary) {
    return [];
  }

  const delimiter = `--${normalizedBoundary}`;
  const closingDelimiter = `${delimiter}--`;
  const lines = rawBody.split(/\r?\n/);
  const parts: string[] = [];
  let collecting = false;
  let currentPart: string[] = [];

  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    if (line === delimiter) {
      if (collecting && currentPart.length > 0) {
        parts.push(currentPart.join('\n'));
      }
      collecting = true;
      currentPart = [];
      continue;
    }
    if (line === closingDelimiter) {
      if (collecting && currentPart.length > 0) {
        parts.push(currentPart.join('\n'));
      }
      break;
    }
    if (collecting) {
      currentPart.push(lineRaw);
    }
  }

  return parts;
}

function parseMimePart(part: string): { headers: Record<string, string>; body: string } | null {
  if (!part) {
    return null;
  }
  const parts = part.split(/\r?\n\r?\n/);
  if (parts.length < 2) {
    return null;
  }
  const headerBlock = parts.shift() ?? '';
  const body = parts.join('\n\n');
  return {
    headers: parseHeaderBlock(headerBlock),
    body
  };
}

function parseHeaderBlock(headerBlock: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let currentKey = '';

  for (const line of headerBlock.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`.trim();
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    currentKey = key;
    headers[key] = headers[key] ? `${headers[key]}\n${value}` : value;
  }

  return headers;
}

function extractRawBodyFromMime(rawMime: string): string {
  if (!rawMime) {
    return '';
  }
  const parts = rawMime.split(/\r?\n\r?\n/);
  if (parts.length < 2) {
    return '';
  }
  return parts.slice(1).join('\n\n').trim();
}

function decodeTransferEncoding(body: string, encoding: string): string {
  const normalizedEncoding = encoding.trim().toLowerCase();
  if (!body || !normalizedEncoding) {
    return body;
  }

  if (normalizedEncoding.includes('quoted-printable')) {
    return decodeQuotedPrintable(body);
  }

  if (normalizedEncoding.includes('base64')) {
    return decodeBase64ToUtf8(body);
  }

  return body;
}

function decodeQuotedPrintable(value: string): string {
  const normalized = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (
      current === '=' &&
      index + 2 < normalized.length &&
      /[A-Fa-f0-9]/.test(normalized[index + 1]) &&
      /[A-Fa-f0-9]/.test(normalized[index + 2])
    ) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    bytes.push(normalized.charCodeAt(index) & 0xff);
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
}

function decodeBase64ToUtf8(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) {
    return '';
  }

  try {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

function htmlToPlainText(html: string): string {
  if (!html) {
    return '';
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\r?\n/g, '<br>');
}

function truncateNullable(value: string, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

export async function getUserInboxFromDb(db: D1Database | undefined, userId: string): Promise<EmailDto[]> {
  if (!db) {
    return inboxFallback(userId);
  }

  const query = `
    SELECT
      id,
      sender,
      subject,
      snippet,
      received_at,
      is_read,
      is_starred,
      is_archived
    FROM emails
    WHERE user_id = ?
      AND deleted_at IS NULL
    ORDER BY is_archived ASC, received_at DESC
    LIMIT 100
  `;
  const { results } = await db.prepare(query).bind(userId).all<Record<string, unknown>>();
  return (results ?? []).map((row) => ({
    id: String(row.id),
    sender: String(row.sender ?? ''),
    subject: String(row.subject ?? '(No Subject)'),
    snippet: String(row.snippet ?? ''),
    receivedAt: String(row.received_at ?? ''),
    isRead: Number(row.is_read ?? 0) === 1,
    isStarred: Number(row.is_starred ?? 0) === 1,
    isArchived: Number(row.is_archived ?? 0) === 1
  }));
}

export interface SearchUserInboxOptions {
  query: string;
  limit?: number;
}

export interface SearchUserInboxResult {
  items: EmailDto[];
  query: string;
  tokenCount: number;
}

export async function searchUserInboxFromDb(
  db: D1Database | undefined,
  userId: string,
  options: SearchUserInboxOptions
): Promise<SearchUserInboxResult> {
  const rawQuery = (options.query ?? '').trim();
  const tokens = rawQuery
    .split(/\s+/)
    .map((token) => token.replace(/[%_]/g, (match) => `\\${match}`))
    .filter((token) => token.length > 0)
    .slice(0, 8);

  if (!db || tokens.length === 0) {
    return { items: [], query: rawQuery, tokenCount: 0 };
  }

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
  const whereSql = tokens
    .map(
      () =>
        '(subject LIKE ? ESCAPE \'\\\' OR sender LIKE ? ESCAPE \'\\\' OR recipient LIKE ? ESCAPE \'\\\' OR snippet LIKE ? ESCAPE \'\\\' OR COALESCE(body_text, \'\') LIKE ? ESCAPE \'\\\')'
    )
    .join(' AND ');

  const bindings: Array<string> = [];
  for (const token of tokens) {
    const needle = `%${token}%`;
    for (let i = 0; i < 5; i += 1) {
      bindings.push(needle);
    }
  }

  const statement = `
    SELECT
      id,
      sender,
      subject,
      snippet,
      received_at,
      is_read,
      is_starred,
      is_archived
    FROM emails
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND ${whereSql}
    ORDER BY received_at DESC
    LIMIT ?
  `;

  const { results } = await db
    .prepare(statement)
    .bind(userId, ...bindings, limit)
    .all<Record<string, unknown>>();

  const items: EmailDto[] = (results ?? []).map((row) => ({
    id: String(row.id),
    sender: String(row.sender ?? ''),
    subject: String(row.subject ?? '(No Subject)'),
    snippet: String(row.snippet ?? ''),
    receivedAt: String(row.received_at ?? ''),
    isRead: Number(row.is_read ?? 0) === 1,
    isStarred: Number(row.is_starred ?? 0) === 1,
    isArchived: Number(row.is_archived ?? 0) === 1
  }));

  return { items, query: rawQuery, tokenCount: tokens.length };
}

export async function getEmailByIdFromDb(
  db: D1Database | undefined,
  userId: string,
  emailId: string
): Promise<EmailDetailDto | null> {
  if (!db) {
    return emailDetailFallback(userId, emailId);
  }

  const row = await db
    .prepare(
      `
      SELECT
        id,
        user_id,
        sender,
        recipient,
        subject,
        snippet,
        received_at,
        is_read,
        is_starred,
        is_archived,
        body_text,
        body_html,
        parsed_text,
        parsed_html
      FROM emails
      WHERE id = ?
        AND user_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `
    )
    .bind(emailId, userId)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  if (Number(row.is_read ?? 0) !== 1) {
    await db.prepare('UPDATE emails SET is_read = 1 WHERE id = ? AND user_id = ?').bind(emailId, userId).run();
  }

  const bodyText = String(row.body_text ?? row.parsed_text ?? row.snippet ?? '');
  const bodyHtml = String(row.body_html ?? row.parsed_html ?? '');

  return {
    id: String(row.id),
    userId: String(row.user_id),
    sender: String(row.sender ?? ''),
    recipient: String(row.recipient ?? ''),
    subject: String(row.subject ?? '(No Subject)'),
    snippet: String(row.snippet ?? ''),
    receivedAt: String(row.received_at ?? ''),
    bodyText,
    bodyHtml,
    isRead: true,
    isStarred: Number(row.is_starred ?? 0) === 1,
    isArchived: Number(row.is_archived ?? 0) === 1
  };
}

export async function getUserArchivedEmailCountFromDb(db: D1Database | undefined, userId: string): Promise<number> {
  if (!db) {
    return 0;
  }

  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM emails WHERE user_id = ? AND deleted_at IS NULL AND is_archived = 1')
    .bind(userId)
    .first<{ count: number }>();

  return Number(row?.count ?? 0);
}

export async function applyEmailQuickActionInDb(
  db: D1Database | undefined,
  userId: string,
  emailId: string,
  action: EmailQuickAction,
  actor: string
): Promise<ApplyEmailQuickActionResult> {
  if (!db) {
    throw new Error('DB binding is required for update operation');
  }

  const beforeState = await getEmailActionState(db, userId, emailId);
  if (!beforeState) {
    return { updated: false, reason: 'not_found' };
  }

  if (beforeState.deletedAt) {
    return { updated: false, reason: 'already_deleted' };
  }

  if (action === 'archive' && beforeState.isArchived) {
    return { updated: false, reason: 'already_archived', email: beforeState };
  }

  if (action === 'star') {
    await db
      .prepare(
        `
        UPDATE emails
        SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END
        WHERE id = ? AND user_id = ?
      `
      )
      .bind(emailId, userId)
      .run();
  }

  if (action === 'archive') {
    await db.prepare('UPDATE emails SET is_archived = 1 WHERE id = ? AND user_id = ?').bind(emailId, userId).run();
  }

  if (action === 'delete') {
    await db
      .prepare("UPDATE emails SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?")
      .bind(emailId, userId)
      .run();
  }

  const afterState = await getEmailActionState(db, userId, emailId);
  if (!afterState) {
    return { updated: false, reason: 'not_found' };
  }

  await writeEmailStatusHistoryInDb(db, emailId, action, actor, buildEmailState(beforeState), buildEmailState(afterState));

  return {
    updated: true,
    email: afterState
  };
}

async function getEmailActionState(
  db: D1Database,
  userId: string,
  emailId: string
): Promise<EmailActionState | null> {
  const row = await db
    .prepare(
      `
      SELECT id, user_id, is_read, is_starred, is_archived, deleted_at
      FROM emails
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `
    )
    .bind(emailId, userId)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    isRead: Number(row.is_read ?? 0) === 1,
    isStarred: Number(row.is_starred ?? 0) === 1,
    isArchived: Number(row.is_archived ?? 0) === 1,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}

async function writeEmailStatusHistoryInDb(
  db: D1Database,
  emailId: string,
  action: string,
  actor: string,
  fromState: string,
  toState: string
): Promise<void> {
  try {
    await db
      .prepare(
        `
        INSERT INTO email_status_history (id, email_id, action, actor, from_state, to_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      )
      .bind(crypto.randomUUID(), emailId, action, actor, fromState, toState)
      .run();
  } catch {
    // Ignore history failures.
  }
}

function buildEmailState(email: EmailActionState): string {
  return `read=${email.isRead ? 1 : 0},starred=${email.isStarred ? 1 : 0},archived=${email.isArchived ? 1 : 0},deleted=${email.deletedAt ? 1 : 0}`;
}

export async function getWorkerSettingsFromDb(db?: D1Database): Promise<WorkerSettingsPageDto> {
  if (!db) {
    return workerFallback;
  }

  const { results } = await db.prepare('SELECT key, value FROM worker_settings').all<Record<string, unknown>>();
  const rawSettings = new Map<string, string>();
  for (const row of results ?? []) {
    const key = String(row.key ?? '');
    if (!key) {
      continue;
    }
    rawSettings.set(key, String(row.value ?? ''));
  }

  return {
    settings: {
      botStatus: rawSettings.get('bot_status') || workerFallback.settings.botStatus,
      botTokenConfigured: Boolean(rawSettings.get('bot_token')?.trim()),
      webhookSecretConfigured: Boolean(rawSettings.get('webhook_secret')?.trim()),
      allowedIds: rawSettings.get('allowed_ids') || workerFallback.settings.allowedIds,
      forwardInbound: parseBooleanSetting(rawSettings.get('forward_inbound'), workerFallback.settings.forwardInbound),
      targetMode: rawSettings.get('target_mode') || workerFallback.settings.targetMode,
      defaultChatId: rawSettings.get('default_chat_id') || workerFallback.settings.defaultChatId,
      testChatId: rawSettings.get('test_chat_id') || workerFallback.settings.testChatId
    },
    webhook: {
      connected: Boolean(rawSettings.get('webhook_url')?.trim()),
      url: rawSettings.get('webhook_url') || workerFallback.webhook.url,
      ipAddress: rawSettings.get('webhook_ip_address') || workerFallback.webhook.ipAddress,
      maxConnections: parseNumberSetting(rawSettings.get('webhook_max_connections'), workerFallback.webhook.maxConnections),
      pendingUpdates: parseNumberSetting(rawSettings.get('webhook_pending_updates'), workerFallback.webhook.pendingUpdates),
      allowedUpdates: parseListSetting(rawSettings.get('webhook_allowed_updates'), workerFallback.webhook.allowedUpdates),
      lastErrorAt: '',
      lastErrorMessage: '',
      source: 'settings'
    }
  };
}

export async function updateWorkerSettingsInDb(
  db: D1Database | undefined,
  input: WorkerSettingsUpdateInput
): Promise<WorkerSettingsPageDto> {
  if (!db) {
    throw new Error('DB binding is required for update operation');
  }

  const nextValues: Array<[string, string]> = [];
  if (input.botToken !== undefined) {
    nextValues.push(['bot_token', input.botToken]);
    nextValues.push(['bot_status', input.botToken ? 'Configured' : 'Missing Token']);
  }
  if (input.webhookSecret !== undefined) {
    nextValues.push(['webhook_secret', input.webhookSecret]);
  }
  if (input.allowedIds !== undefined) {
    nextValues.push(['allowed_ids', input.allowedIds]);
  }
  if (input.forwardInbound !== undefined) {
    nextValues.push(['forward_inbound', input.forwardInbound ? '1' : '0']);
  }
  if (input.targetMode !== undefined) {
    nextValues.push(['target_mode', input.targetMode]);
  }
  if (input.defaultChatId !== undefined) {
    nextValues.push(['default_chat_id', input.defaultChatId]);
  }
  if (input.testChatId !== undefined) {
    nextValues.push(['test_chat_id', input.testChatId]);
  }

  await Promise.all(
    nextValues.map(([key, value]) =>
      db
        .prepare(
          `
          INSERT INTO worker_settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        `
        )
        .bind(key, value)
        .run()
    )
  );

  return getWorkerSettingsFromDb(db);
}

export async function createUserInDb(db: D1Database | undefined, input: CreateUserInput): Promise<UserDto> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || email;
  const passwordHash = input.passwordHash ?? null;

  if (!db) {
    throw new Error('DB binding is required for create operation');
  }

  const telegramEnabled = input.telegramEnabled ?? true;
  const telegramEnabledInt = telegramEnabled ? 1 : 0;

  const id = crypto.randomUUID();
  const hasCol = await hasTelegramEnabledColumn(db);

  if (hasCol) {
    await db
      .prepare(
        `
        INSERT INTO users (id, email, display_name, password_hash, telegram_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      )
      .bind(id, email, displayName, passwordHash, telegramEnabledInt)
      .run();
  } else {
    await db
      .prepare(
        `
        INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      )
      .bind(id, email, displayName, passwordHash)
      .run();
  }

  return {
    id,
    email,
    displayName,
    role: 'member',
    status: 'active',
    telegramEnabled
  };
}

export async function updateUserInDb(
  db: D1Database | undefined,
  userId: string,
  input: UpdateUserInput
): Promise<UserDto | null> {
  if (!db) {
    throw new Error('DB binding is required for update operation');
  }

  const existing = await getUserByIdFromDb(db, userId);
  if (!existing) {
    return null;
  }

  const nextEmail = input.email?.trim().toLowerCase() ?? existing.email;
  const nextDisplayName = input.displayName?.trim() ?? existing.displayName;
  const nextTelegramEnabled = input.telegramEnabled ?? existing.telegramEnabled;
  const existingAuth = await getUserAuthByEmail(db, existing.email);
  const nextPasswordHash = input.passwordHash ?? existingAuth?.passwordHash ?? null;

  const hasCol = await hasTelegramEnabledColumn(db);

  if (hasCol) {
    await db
      .prepare(
        `
        UPDATE users
        SET email = ?, display_name = ?, password_hash = ?, telegram_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .bind(nextEmail, nextDisplayName, nextPasswordHash, nextTelegramEnabled ? 1 : 0, userId)
      .run();
  } else {
    await db
      .prepare(
        `
        UPDATE users
        SET email = ?, display_name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .bind(nextEmail, nextDisplayName, nextPasswordHash, userId)
      .run();
  }

  return {
    ...existing,
    email: nextEmail,
    displayName: nextDisplayName,
    telegramEnabled: nextTelegramEnabled
  };
}

export async function deleteUserInDb(db: D1Database | undefined, userId: string): Promise<DeleteUserResult> {
  if (!db) {
    throw new Error('DB binding is required for delete operation');
  }

  const existing = await getUserByIdFromDb(db, userId);
  if (!existing) {
    return { deleted: false, reason: 'not_found' };
  }

  const [emailRef, sessionRef] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM emails WHERE user_id = ?').bind(userId).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM login_sessions WHERE user_id = ?').bind(userId).first<{ count: number }>()
  ]);

  const emailCount = Number(emailRef?.count ?? 0);
  const loginSessionCount = Number(sessionRef?.count ?? 0);

  if (emailCount > 0 || loginSessionCount > 0) {
    return {
      deleted: false,
      reason: 'has_dependencies',
      emailCount,
      loginSessionCount
    };
  }

  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return { deleted: true };
}

export async function softDeleteUserInDb(db: D1Database | undefined, userId: string): Promise<SoftDeleteUserResult> {
  if (!db) {
    throw new Error('DB binding is required for delete operation');
  }

  const row = await db
    .prepare(
      `
      WITH owner AS (
        SELECT id AS owner_id
        FROM users
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      )
      SELECT
        u.id,
        u.email,
        COALESCE(u.display_name, u.email) AS display_name,
        u.password_hash,
        CASE WHEN u.id = (SELECT owner_id FROM owner) THEN 1 ELSE 0 END AS is_owner
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `
    )
    .bind(userId)
    .first<{ id: string; email: string; display_name: string; password_hash: string | null; is_owner: number }>();

  if (!row) {
    return { deleted: false, reason: 'not_found' };
  }

  if (Number(row.is_owner) === 1) {
    return { deleted: false, reason: 'protected_owner' };
  }

  if (!row.password_hash) {
    return { deleted: false, reason: 'already_deleted' };
  }

  const domain = (row.email.split('@')[1] ?? 'mailflare.local').toLowerCase();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const tombstoneEmail = `deleted+${suffix}@${domain}`;
  const tombstoneName = `${row.display_name} (deleted)`.slice(0, 120);

  await db
    .prepare(
      `
      UPDATE users
      SET email = ?, display_name = ?, password_hash = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    )
    .bind(tombstoneEmail, tombstoneName, userId)
    .run();

  await db.prepare('DELETE FROM login_sessions WHERE user_id = ?').bind(userId).run();

  return { deleted: true };
}

const dashboardOverviewFallback: DashboardDto = {
  generatedAt: new Date().toISOString(),
  metrics: [
    { key: 'users', label: 'Registered Users', value: '2', hint: '2 telegram aktif', status: 'ok', tone: 'primary', icon: 'group' },
    { key: 'emails', label: 'Email Records', value: '2', hint: '2 dalam 7 hari terakhir', delta: '+0 hari ini', status: 'ok', tone: 'primary', icon: 'mail' },
    { key: 'unread', label: 'Unread Inbox Items', value: '2', hint: 'Perlu ditinjau', status: 'warning', tone: 'warning', icon: 'mark_email_unread' },
    { key: 'starred', label: 'Starred by Admin', value: '1', hint: 'Disimpan permanen', status: 'ok', tone: 'success', icon: 'star' },
    { key: 'archived', label: 'Archived', value: '1', hint: 'Dipindahkan dari inbox', status: 'ok', tone: 'neutral', icon: 'archive' },
    { key: 'deleted', label: 'Soft Deleted', value: '0', hint: 'Dalam masa retensi', status: 'ok', tone: 'danger', icon: 'delete' }
  ],
  pipeline: {
    total: 2,
    read: 0,
    unread: 2,
    starred: 1,
    archived: 1,
    deleted: 0,
    withAttachments: 0,
    averageSizeKb: 12.4,
    totalSizeMb: 0.05,
    receivedToday: 0,
    receivedLast7Days: 2
  },
  users: {
    total: 2,
    telegramEnabled: 2,
    telegramDisabled: 0,
    topActive: [
      { id: 'u1', displayName: 'Alex Flare', email: 'alex@mailflare.dev', role: 'owner', telegramEnabled: true, totalEmails: 1, unreadEmails: 1 },
      { id: 'u2', displayName: 'Ops Notify', email: 'ops@mailflare.dev', role: 'member', telegramEnabled: true, totalEmails: 1, unreadEmails: 1 }
    ]
  },
  system: {
    worker: 'operational',
    activeLoginSessions: 0,
    activeApiKeys: 0,
    pendingAccessCodes: 0,
    telegramUpdatesLast24h: 0,
    emailsLastHour: 0
  },
  recentActivity: []
};

const usersFallback: UserDto[] = [
  { id: 'u1', email: 'alex@mailflare.dev', displayName: 'Alex Flare', role: 'owner', status: 'active', telegramEnabled: true, totalEmails: 27, unreadEmails: 3 },
  { id: 'u2', email: 'ops@mailflare.dev', displayName: 'Ops Notify', role: 'member', status: 'active', telegramEnabled: true, totalEmails: 14, unreadEmails: 1 }
];

function inboxFallback(userId: string): EmailDto[] {
  return [
    {
      id: `${userId}-e1`,
      sender: 'postmaster@infra.mailflare.dev',
      subject: 'Uptime optimization at no extra cost',
      snippet: 'We identified throughput improvements in your eu-west-1 routing tables...',
      receivedAt: new Date().toISOString(),
      isRead: false,
      isStarred: true,
      isArchived: false
    },
    {
      id: `${userId}-e2`,
      sender: 'alerts@cloudflare.com',
      subject: 'Security Alert: New Login',
      snippet: 'Your account logged in from a new device...',
      receivedAt: new Date(Date.now() - 3600_000).toISOString(),
      isRead: true,
      isStarred: false,
      isArchived: true
    }
  ];
}

function emailDetailFallback(userId: string, emailId: string): EmailDetailDto | null {
  const summary = inboxFallback(userId).find((email) => email.id === emailId);
  if (!summary) {
    return null;
  }

  return {
    id: summary.id,
    userId,
    sender: summary.sender,
    recipient: `${userId}@mailflare.dev`,
    subject: summary.subject,
    snippet: summary.snippet,
    receivedAt: summary.receivedAt,
    bodyText: summary.snippet,
    bodyHtml: '',
    isRead: summary.isRead,
    isStarred: summary.isStarred,
    isArchived: summary.isArchived
  };
}

function parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US').format(Math.trunc(value));
}

function parseNumberSetting(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseListSetting(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

const workerFallback: WorkerSettingsPageDto = {
  settings: {
    botStatus: 'Missing Token',
    botTokenConfigured: false,
    webhookSecretConfigured: false,
    allowedIds: '',
    forwardInbound: false,
    targetMode: 'All Allowed IDs',
    defaultChatId: '',
    testChatId: ''
  },
  webhook: {
    connected: false,
    url: '',
    ipAddress: '',
    maxConnections: 0,
    pendingUpdates: 0,
    allowedUpdates: [],
    lastErrorAt: '',
    lastErrorMessage: '',
    source: 'settings'
  }
};
