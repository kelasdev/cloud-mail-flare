import { createUserInDb } from '$lib/server/db';
import { generateAccessCode, isAccessCodeFormatValid, normalizeAccessCode } from '$lib/server/access-code';
import { generateSecurePassword, hashPassword, sha256Hex } from '$lib/server/security';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const USER_LIST_PAGE_SIZE = 10;
const INBOX_PAGE_SIZE = 10;
const ACCESS_CODE_TTL_MINUTES = 10;
const MARKDOWN_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

type SortOrder = 'asc' | 'desc';

interface TelegramChat {
  id: number;
}

interface TelegramUser {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

type TelegramInlineKeyboard = TelegramInlineKeyboardButton[][];

interface TelegramMessageResponse {
  message_id: number;
}

interface TelegramConfig {
  token: string;
  allowedIds: Set<string>;
  targetMode: string;
  defaultChatId: string;
  testChatId: string;
  forwardInbound: boolean;
}

interface TelegramCommandContext {
  db: D1Database;
  config: TelegramConfig;
  env?: TelegramPlatformEnv;
  chatId: string;
  telegramUserId: string;
}

interface TelegramEmailDbRecord {
  id: string;
  user_email: string;
  sender: string;
  recipient: string;
  subject: string;
  snippet: string;
  body_text: string;
  parsed_text: string;
  received_at: string;
  is_read: number;
  is_starred: number;
  is_archived: number;
  deleted_at: string | null;
}

export interface TelegramPlatformEnv {
  DB?: D1Database;
  MAILFLARE_USER_DOMAIN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_IDS?: string;
  TELEGRAM_DEFAULT_CHAT_ID?: string;
  TELEGRAM_TEST_CHAT_ID?: string;
}

export interface TelegramUserCreatedPayload {
  username: string;
  email: string;
  password: string;
  createdBy: string;
}

export interface TelegramInboundEmailPayload {
  emailId: string;
  sender: string;
  recipient: string;
  subject?: string;
  snippet?: string;
}

export interface TelegramWebhookProcessInput {
  db?: D1Database;
  env?: TelegramPlatformEnv;
  update: unknown;
}

export interface TelegramWebhookInfoSnapshot {
  connected: boolean;
  url: string;
  ipAddress: string;
  maxConnections: number;
  pendingUpdates: number;
  allowedUpdates: string[];
  lastErrorAt: string;
  lastErrorMessage: string;
}

export interface TelegramTestConnectionResult {
  ok: boolean;
  message: string;
  targetChatId: string;
  webhook: TelegramWebhookInfoSnapshot | null;
}

export interface TelegramConnectWebhookResult {
  ok: boolean;
  message: string;
  webhook: TelegramWebhookInfoSnapshot | null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
}

export async function verifyTelegramWebhookSecret(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined,
  providedSecret: string
): Promise<boolean> {
  const envSecret = (env?.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  const dbSecret = db ? await getWorkerSettingValue(db, 'webhook_secret') : '';
  const expected = (dbSecret || envSecret).trim();
  if (!expected) {
    return true;
  }
  return providedSecret.trim() === expected;
}

export async function processTelegramWebhookUpdate(input: TelegramWebhookProcessInput): Promise<void> {
  const { db, env } = input;
  const update = parseTelegramUpdate(input.update);
  if (!update || !db) {
    return;
  }

  const config = await loadTelegramConfig(db, env);
  if (!config) {
    return;
  }

  if (typeof update.update_id === 'number') {
    const duplicated = await isDuplicateUpdate(db, update.update_id);
    if (duplicated) {
      return;
    }
  }

  if (update.callback_query) {
    await handleCallbackUpdate({ db, config, env }, update.callback_query);
    return;
  }

  if (update.message?.text) {
    await handleMessageUpdate({ db, config, env }, update.message);
  }
}

export async function sendUserCreatedTelegramNotification(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined,
  payload: TelegramUserCreatedPayload
): Promise<number> {
  if (!db) {
    return 0;
  }

  const config = await loadTelegramConfig(db, env);
  if (!config) {
    return 0;
  }

  const targetChatIds = resolveTargetChatIds(config);
  if (targetChatIds.length === 0) {
    return 0;
  }

  const text = buildUserCreatedMarkdown(payload);
  let sentCount = 0;
  for (const chatId of targetChatIds) {
    try {
      await sendTelegramMessage(config.token, chatId, text);
      sentCount += 1;
    } catch {
      // Notification failure should not fail user creation flow.
    }
  }

  return sentCount;
}

export async function sendInboundEmailTelegramNotification(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined,
  payload: TelegramInboundEmailPayload
): Promise<number> {
  if (!db) {
    return 0;
  }

  const config = await loadTelegramConfig(db, env);
  if (!config || !config.forwardInbound) {
    return 0;
  }

  const targetChatIds = resolveTargetChatIds(config);
  if (targetChatIds.length === 0) {
    return 0;
  }

  const text = buildInboundEmailMarkdown(payload);
  const keyboard = buildEmailActionKeyboard(payload.emailId);
  let sentCount = 0;

  for (const chatId of targetChatIds) {
    try {
      await sendTelegramMessage(config.token, chatId, text, keyboard);
      sentCount += 1;
    } catch {
      // Notification failure should not fail email ingestion flow.
    }
  }

  return sentCount;
}

export async function getTelegramWebhookInfo(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined
): Promise<TelegramWebhookInfoSnapshot | null> {
  if (!db) {
    return null;
  }

  const config = await loadTelegramConfig(db, env);
  if (!config) {
    return null;
  }

  const info = await telegramApi<{
    url?: string;
    pending_update_count?: number;
    ip_address?: string;
    max_connections?: number;
    allowed_updates?: string[];
    last_error_message?: string;
    last_error_date?: number;
  }>(config.token, 'getWebhookInfo', {});

  return {
    connected: Boolean(info.url),
    url: String(info.url ?? ''),
    ipAddress: String(info.ip_address ?? ''),
    maxConnections: Number(info.max_connections ?? 0),
    pendingUpdates: Number(info.pending_update_count ?? 0),
    allowedUpdates: Array.isArray(info.allowed_updates) ? info.allowed_updates.map((item) => String(item)) : [],
    lastErrorAt: formatUnixTimestamp(info.last_error_date),
    lastErrorMessage: String(info.last_error_message ?? '')
  };
}

export async function connectTelegramWebhook(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined,
  webhookUrl: string
): Promise<TelegramConnectWebhookResult> {
  if (!db) {
    return {
      ok: false,
      message: 'Database is not configured',
      webhook: null
    };
  }

  const normalizedWebhookUrl = webhookUrl.trim();
  if (!normalizedWebhookUrl) {
    return {
      ok: false,
      message: 'Webhook URL is required',
      webhook: null
    };
  }

  const config = await loadTelegramConfig(db, env);
  if (!config) {
    return {
      ok: false,
      message: 'Telegram bot token is not configured',
      webhook: null
    };
  }

  const settings = await loadWorkerSettingsMap(db);
  const dbSecret = (settings.get('webhook_secret') ?? '').trim();
  const envSecret = (env?.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  const webhookSecret = dbSecret || envSecret;
  const allowedUpdates = parseWebhookAllowedUpdates(
    (settings.get('webhook_allowed_updates') ?? '').trim() || 'message,callback_query'
  );
  const maxConnections = Number.parseInt((settings.get('webhook_max_connections') ?? '').trim(), 10);
  const ipAddress = (settings.get('webhook_ip_address') ?? '').trim();

  try {
    await telegramApi(config.token, 'setWebhook', {
      url: normalizedWebhookUrl,
      allowed_updates: allowedUpdates,
      ...(webhookSecret ? { secret_token: webhookSecret } : {}),
      ...(Number.isFinite(maxConnections) && maxConnections > 0 ? { max_connections: maxConnections } : {}),
      ...(ipAddress ? { ip_address: ipAddress } : {})
    });

    const webhook = await getTelegramWebhookInfo(db, env).catch(() => null);
    if (webhook) {
      await persistWebhookSnapshot(db, webhook);
    }

    return {
      ok: true,
      message: webhook?.connected ? 'Telegram webhook connected' : 'Webhook configured but Telegram still reports disconnected',
      webhook
    };
  } catch (error) {
    const webhook = await getTelegramWebhookInfo(db, env).catch(() => null);
    return {
      ok: false,
      message: `Failed to connect Telegram webhook: ${toErrorMessage(error)}`,
      webhook
    };
  }
}

export async function sendTelegramTestConnection(
  db: D1Database | undefined,
  env: TelegramPlatformEnv | undefined
): Promise<TelegramTestConnectionResult> {
  if (!db) {
    return {
      ok: false,
      message: 'Database is not configured',
      targetChatId: '',
      webhook: null
    };
  }

  const config = await loadTelegramConfig(db, env);
  if (!config) {
    return {
      ok: false,
      message: 'Telegram bot token is not configured',
      targetChatId: '',
      webhook: null
    };
  }

  const targetChatId = config.testChatId || config.defaultChatId || Array.from(config.allowedIds)[0] || '';
  if (!targetChatId) {
    const webhook = await getTelegramWebhookInfo(db, env).catch(() => null);
    return {
      ok: false,
      message: 'No target chat id configured',
      targetChatId: '',
      webhook
    };
  }

  const text = [
    '*Telegram test connection*',
    '',
    `time: ${inlineCodeMd(new Date().toISOString())}`,
    `chat: ${inlineCodeMd(targetChatId)}`
  ].join('\n');

  try {
    await sendTelegramMessage(config.token, targetChatId, text);
    const webhook = await getTelegramWebhookInfo(db, env).catch(() => null);
    return {
      ok: true,
      message: 'Test message sent successfully',
      targetChatId,
      webhook
    };
  } catch (error) {
    const webhook = await getTelegramWebhookInfo(db, env).catch(() => null);
    const reason = toErrorMessage(error);
    return {
      ok: false,
      message: `Failed to send Telegram test message: ${reason}`,
      targetChatId,
      webhook
    };
  }
}
async function handleMessageUpdate(
  base: { db: D1Database; config: TelegramConfig; env?: TelegramPlatformEnv },
  message: TelegramMessage
): Promise<void> {
  const chatId = String(message.chat?.id ?? '');
  const telegramUserId = String(message.from?.id ?? '');
  const rawText = message.text?.trim() ?? '';
  if (!chatId || !telegramUserId || !rawText) {
    return;
  }

  if (!isAllowedTelegramUser(base.config, telegramUserId)) {
    await sendTelegramMessage(base.config.token, chatId, escapeMarkdownV2('Unauthorized Telegram user ID.'));
    return;
  }

  const context: TelegramCommandContext = {
    db: base.db,
    config: base.config,
    env: base.env,
    chatId,
    telegramUserId
  };

  const command = parseCommand(rawText);
  switch (command.name) {
    case 'adduser':
      await handleAddUserCommand(context, command.args);
      return;
    case 'listuser':
      await handleListUserCommand(context, command.args);
      return;
    case 'inbox':
      await handleInboxCommand(context, command.args);
      return;
    case 'readmail':
      await handleReadMailCommand(context, command.args);
      return;
    case 'access':
      await handleAccessCommand(context);
      return;
    case 'reset':
      await handleResetCommand(context, command.args);
      return;
    case 'help':
    case 'start':
      await sendTelegramMessage(base.config.token, chatId, buildHelpMarkdown());
      return;
    default:
      await sendTelegramMessage(base.config.token, chatId, buildHelpMarkdown());
  }
}

async function handleCallbackUpdate(
  base: { db: D1Database; config: TelegramConfig; env?: TelegramPlatformEnv },
  callback: TelegramCallbackQuery
): Promise<void> {
  const callbackId = callback.id;
  const telegramUserId = String(callback.from?.id ?? '');
  const chatId = String(callback.message?.chat?.id ?? '');
  const data = callback.data?.trim() ?? '';
  const messageId = callback.message?.message_id;

  if (!callbackId || !telegramUserId || !data) {
    return;
  }

  if (!isAllowedTelegramUser(base.config, telegramUserId)) {
    await answerCallbackQuery(base.config.token, callbackId, 'Unauthorized Telegram user ID.', true);
    return;
  }

  if (data.startsWith('lu:')) {
    const [_, orderRaw, offsetRaw] = data.split(':');
    const order = orderRaw === 'a' ? 'asc' : 'desc';
    const offsetParsed = Number(offsetRaw);
    const offset = Number.isFinite(offsetParsed) && offsetParsed >= 0 ? Math.floor(offsetParsed) : 0;
    if (!chatId) {
      await answerCallbackQuery(base.config.token, callbackId, 'Cannot open page.');
      return;
    }
    await showUserListPage(base.config.token, base.db, chatId, order, offset, messageId);
    await answerCallbackQuery(base.config.token, callbackId, 'OK');
    return;
  }

  if (data.startsWith('em:')) {
    const actionResult = await applyEmailAction(base.db, telegramUserId, data);
    await answerCallbackQuery(base.config.token, callbackId, actionResult, false);
    return;
  }

  await answerCallbackQuery(base.config.token, callbackId, 'Unsupported action.');
}

async function handleAddUserCommand(context: TelegramCommandContext, args: string[]): Promise<void> {
  const username = (args[0] ?? '').trim().toLowerCase();
  const invalidReason = validateUsername(username, 'adduser');
  if (invalidReason) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2(invalidReason));
    return;
  }

  try {
    const domain = await resolveUserDomain(context.db, context.env?.MAILFLARE_USER_DOMAIN);
    const email = `${username}@${domain}`;
    const password = generateSecurePassword(18);
    const passwordHash = await hashPassword(password);
    await createUserInDb(context.db, { email, displayName: username, passwordHash });

    const text = buildUserCreatedMarkdown({
      username,
      email,
      password,
      createdBy: `telegram:${context.telegramUserId}`
    });
    await sendTelegramMessage(context.config.token, context.chatId, text);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes('unique') || message.includes('users.email')) {
      await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Username already exists.'));
      return;
    }
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Failed to create user.'));
  }
}

async function handleListUserCommand(context: TelegramCommandContext, args: string[]): Promise<void> {
  const order = args[0]?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  await showUserListPage(context.config.token, context.db, context.chatId, order, 0);
}

async function handleInboxCommand(context: TelegramCommandContext, args: string[]): Promise<void> {
  const username = (args[0] ?? '').trim().toLowerCase();
  const invalidReason = validateUsername(username, 'inbox');
  if (invalidReason) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2(invalidReason));
    return;
  }

  const user = await findUserByUsername(context.db, username);
  if (!user) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('User not found.'));
    return;
  }

  const { results } = await context.db
    .prepare(
      `
      SELECT id, sender, subject, snippet, received_at
      FROM emails
      WHERE user_id = ?
        AND deleted_at IS NULL
      ORDER BY received_at DESC, id DESC
      LIMIT ${INBOX_PAGE_SIZE}
    `
    )
    .bind(user.id)
    .all<Record<string, unknown>>();

  const rows = results ?? [];
  if (rows.length === 0) {
    await sendTelegramMessage(
      context.config.token,
      context.chatId,
      `*Inbox kosong* untuk user ${inlineCodeMd(username)}\\.`
    );
    return;
  }

  const lines = rows.map((row, index) => {
    const emailId = String(row.id ?? '');
    const sender = compactWhitespace(String(row.sender ?? ''));
    const subject = compactWhitespace(String(row.subject ?? '(No Subject)'));
    const snippet = compactWhitespace(String(row.snippet ?? ''));
    return [
      `[${index + 1}]`,
      `id     : ${truncate(emailId, 96)}`,
      `from   : ${truncate(sender, 96)}`,
      `subject: ${truncate(subject, 96)}`,
      `snippet: ${truncate(snippet, 120)}`
    ].join('\n');
  });

  const text = [
    `*Inbox user* ${inlineCodeMd(username)}`,
    '',
    '```text',
    lines.join('\n\n'),
    '```',
    '',
    'Gunakan \\`readmail <email_id>\\` untuk baca detail email\\.'
  ].join('\n');

  await sendTelegramMessage(context.config.token, context.chatId, text);
}
async function handleReadMailCommand(context: TelegramCommandContext, args: string[]): Promise<void> {
  const emailId = (args[0] ?? '').trim();
  if (!emailId) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Usage: readmail <email_id>'));
    return;
  }

  const email = await getEmailById(context.db, emailId);
  if (!email || email.deleted_at) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Email not found.'));
    return;
  }

  if (email.is_read !== 1) {
    await context.db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(email.id).run();
  }

  const text = buildReadMailMarkdown(email);
  const keyboard = buildEmailActionKeyboard(email.id);
  await sendTelegramMessage(context.config.token, context.chatId, text, keyboard);
}

async function handleAccessCommand(context: TelegramCommandContext): Promise<void> {
  const code = generateAccessCode();
  const normalizedCode = normalizeAccessCode(code);
  if (!isAccessCodeFormatValid(normalizedCode)) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Failed to generate access code.'));
    return;
  }

  const codeHash = await sha256Hex(normalizedCode);
  await context.db
    .prepare(
      `
      UPDATE access_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE telegram_user_id = ?
        AND used_at IS NULL
    `
    )
    .bind(context.telegramUserId)
    .run();

  await context.db
    .prepare(
      `
      INSERT INTO access_codes (id, code_hash, telegram_user_id, created_at, expires_at, used_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+${ACCESS_CODE_TTL_MINUTES} minute'), NULL)
    `
    )
    .bind(crypto.randomUUID(), codeHash, context.telegramUserId)
    .run();

  const text = [
    '*One\\-time Access Code*',
    '',
    inlineCodeMd(code),
    '',
    `Berlaku ${ACCESS_CODE_TTL_MINUTES} menit dan hanya bisa dipakai sekali\\.`
  ].join('\n');

  await sendTelegramMessage(context.config.token, context.chatId, text);
}

async function handleResetCommand(context: TelegramCommandContext, args: string[]): Promise<void> {
  const username = (args[0] ?? '').trim().toLowerCase();
  const invalidReason = validateUsername(username, 'reset');
  if (invalidReason) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2(invalidReason));
    return;
  }

  const user = await findUserByUsername(context.db, username);
  if (!user) {
    await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('User not found.'));
    return;
  }

  const password = generateSecurePassword(18);
  const passwordHash = await hashPassword(password);
  await context.db
    .prepare(
      `
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    )
    .bind(passwordHash, user.id)
    .run();

  const text = [
    '*Password user berhasil di\\-reset*',
    '',
    '```text',
    `username : ${extractUsername(user.email)}`,
    `email    : ${user.email}`,
    `password : ${password}`,
    '```'
  ].join('\n');

  await sendTelegramMessage(context.config.token, context.chatId, text);
}

async function showUserListPage(
  token: string,
  db: D1Database,
  chatId: string,
  order: SortOrder,
  offset: number,
  messageId?: number
): Promise<void> {
  const safeOffset = Math.max(0, offset);
  const safeOrder: SortOrder = order === 'asc' ? 'asc' : 'desc';
  const sortSql = safeOrder === 'asc' ? 'ASC' : 'DESC';

  const [countRow, listRows] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    db
      .prepare(
        `
        SELECT id, email, COALESCE(display_name, email) AS display_name, created_at
        FROM users
        ORDER BY created_at ${sortSql}, id ${sortSql}
        LIMIT ${USER_LIST_PAGE_SIZE}
        OFFSET ${safeOffset}
      `
      )
      .all<Record<string, unknown>>()
  ]);

  const total = Number(countRow?.count ?? 0);
  const rows = listRows.results ?? [];

  const start = total === 0 ? 0 : safeOffset + 1;
  const end = total === 0 ? 0 : safeOffset + rows.length;
  const hasPrev = safeOffset > 0;
  const hasNext = safeOffset + USER_LIST_PAGE_SIZE < total;

  const bodyLines =
    rows.length > 0
      ? rows.map((row, index) => `${safeOffset + index + 1}. ${extractUsername(String(row.email ?? ''))} | ${String(row.email ?? '')}`)
      : ['(no users)'];

  const text = [
    `*Daftar User \\(${safeOrder.toUpperCase()}\\)*`,
    `Menampilkan ${escapeMarkdownV2(String(start))}\\-${escapeMarkdownV2(String(end))} dari ${escapeMarkdownV2(String(total))}`,
    '',
    '```text',
    bodyLines.join('\n'),
    '```'
  ].join('\n');

  const keyboard: TelegramInlineKeyboard = [];
  const navRow: TelegramInlineKeyboardButton[] = [];
  if (hasPrev) {
    navRow.push({
      text: 'Prev',
      callback_data: `lu:${safeOrder === 'asc' ? 'a' : 'd'}:${Math.max(0, safeOffset - USER_LIST_PAGE_SIZE)}`
    });
  }
  if (hasNext) {
    navRow.push({
      text: 'Next',
      callback_data: `lu:${safeOrder === 'asc' ? 'a' : 'd'}:${safeOffset + USER_LIST_PAGE_SIZE}`
    });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  if (messageId !== undefined) {
    await editTelegramMessage(token, chatId, messageId, text, keyboard);
    return;
  }

  await sendTelegramMessage(token, chatId, text, keyboard);
}

async function applyEmailAction(db: D1Database, telegramUserId: string, callbackData: string): Promise<string> {
  const parts = callbackData.split(':');
  if (parts.length < 3) {
    return 'Invalid callback data';
  }

  const action = parts[1];
  const emailId = parts.slice(2).join(':');
  if (!emailId) {
    return 'Email id is required';
  }

  const email = await getEmailById(db, emailId);
  if (!email) {
    return 'Email not found';
  }

  const fromState = buildEmailState(email);
  switch (action) {
    case 'star':
      await db.prepare('UPDATE emails SET is_starred = 1 WHERE id = ?').bind(emailId).run();
      break;
    case 'archive':
      await db.prepare('UPDATE emails SET is_archived = 1 WHERE id = ?').bind(emailId).run();
      break;
    case 'read':
      await db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(emailId).run();
      break;
    case 'delete':
      await db.prepare("UPDATE emails SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE id = ?").bind(emailId).run();
      break;
    default:
      return 'Unsupported action';
  }

  const updated = await getEmailById(db, emailId);
  if (updated) {
    await writeEmailStatusHistory(db, emailId, action, `telegram:${telegramUserId}`, fromState, buildEmailState(updated));
  }

  if (action === 'star') return 'Email starred';
  if (action === 'archive') return 'Email archived';
  if (action === 'read') return 'Email marked as read';
  return 'Email soft deleted';
}
async function writeEmailStatusHistory(
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

async function getEmailById(db: D1Database, emailId: string): Promise<TelegramEmailDbRecord | null> {
  const row = await db
    .prepare(
      `
      SELECT
        e.id,
        u.email AS user_email,
        e.sender,
        e.recipient,
        e.subject,
        e.snippet,
        e.body_text,
        e.parsed_text,
        e.received_at,
        e.is_read,
        e.is_starred,
        e.is_archived,
        e.deleted_at
      FROM emails e
      JOIN users u ON u.id = e.user_id
      WHERE e.id = ?
      LIMIT 1
    `
    )
    .bind(emailId)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id ?? ''),
    user_email: String(row.user_email ?? ''),
    sender: String(row.sender ?? ''),
    recipient: String(row.recipient ?? ''),
    subject: String(row.subject ?? ''),
    snippet: String(row.snippet ?? ''),
    body_text: String(row.body_text ?? ''),
    parsed_text: String(row.parsed_text ?? ''),
    received_at: String(row.received_at ?? ''),
    is_read: Number(row.is_read ?? 0),
    is_starred: Number(row.is_starred ?? 0),
    is_archived: Number(row.is_archived ?? 0),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null
  };
}

function buildEmailState(email: TelegramEmailDbRecord): string {
  return `read=${email.is_read ? 1 : 0},starred=${email.is_starred ? 1 : 0},archived=${email.is_archived ? 1 : 0},deleted=${email.deleted_at ? 1 : 0}`;
}

function buildReadMailMarkdown(email: TelegramEmailDbRecord): string {
  const bodyRaw = email.body_text || email.parsed_text || email.snippet || '';
  const body = truncate(compactWhitespace(stripHtml(bodyRaw)), 2400);
  const subject = email.subject || '(No Subject)';
  const receivedAt = email.received_at || '-';

  return [
    '*Detail Email*',
    `> ${inlineCodeMd(`${email.sender} | ${email.recipient} | ${email.id}`)}`,
    `*Subjek:* ${escapeMarkdownV2(subject)}`,
    `*User:* ${inlineCodeMd(email.user_email)}`,
    `*Received:* ${inlineCodeMd(receivedAt)}`,
    '',
    '*Body:*',
    '```text',
    sanitizeCodeBlock(body || '(empty body)'),
    '```'
  ].join('\n');
}

function buildHelpMarkdown(): string {
  return [
    '*MailFlare Telegram Commands*',
    '',
    '\\- \\`adduser <username>\\`',
    '\\- \\`listuser <asc|desc>\\`',
    '\\- \\`inbox <username>\\`',
    '\\- \\`readmail <email_id>\\`',
    '\\- \\`access\\`',
    '\\- \\`reset <username>\\`'
  ].join('\n');
}

function buildUserCreatedMarkdown(payload: TelegramUserCreatedPayload): string {
  return [
    '*User Berhasil Dibuat*',
    '',
    '```text',
    `username  : ${payload.username}`,
    `email     : ${payload.email}`,
    `password  : ${payload.password}`,
    `created_by: ${payload.createdBy}`,
    `created_at: ${new Date().toISOString()}`,
    '```'
  ].join('\n');
}

function buildInboundEmailMarkdown(payload: TelegramInboundEmailPayload): string {
  const subject = truncate(compactWhitespace(payload.subject || '(No Subject)'), 120);
  const senderAddress = extractEmailAddress(payload.sender);
  const recipientAddress = extractEmailAddress(payload.recipient);

  return [
    '*📬 EMAIL MASUK*',
    '',
    `*Dari    :* ${escapeMarkdownV2(senderAddress)}`,
    `*Ke      :* ${escapeMarkdownV2(recipientAddress)}`,
    `*Subject :* ${escapeMarkdownV2(subject)}`,
    '',
    `*Baca Email :* ${inlineCodeMd(`/readmail ${payload.emailId}`)}`
  ].join('\n');
}

function buildEmailActionKeyboard(emailId: string): TelegramInlineKeyboard {
  return [
    [
      { text: 'Star', callback_data: `em:star:${emailId}` },
      { text: 'Archive', callback_data: `em:archive:${emailId}` }
    ],
    [
      { text: 'Mark as Read', callback_data: `em:read:${emailId}` },
      { text: 'Soft Delete', callback_data: `em:delete:${emailId}` }
    ]
  ];
}

async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  keyboard?: TelegramInlineKeyboard
): Promise<TelegramMessageResponse> {
  return telegramApi<TelegramMessageResponse>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {})
  });
}

async function editTelegramMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  keyboard?: TelegramInlineKeyboard
): Promise<void> {
  await telegramApi(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {})
  });
}

async function answerCallbackQuery(token: string, callbackId: string, text: string, showAlert = false): Promise<void> {
  await telegramApi(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: truncate(text, 180),
    show_alert: showAlert
  });
}

async function telegramApi<T = unknown>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => null)) as { ok?: boolean; description?: string; result?: T } | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API ${method} failed`);
  }

  return data.result as T;
}
async function loadTelegramConfig(db: D1Database, env: TelegramPlatformEnv | undefined): Promise<TelegramConfig | null> {
  const settings = await loadWorkerSettingsMap(db);
  const dbToken = (settings.get('bot_token') ?? '').trim();
  const envToken = (env?.TELEGRAM_BOT_TOKEN ?? '').trim();
  const token = dbToken || envToken;
  if (!token) {
    return null;
  }

  const hasAllowedIdsInDb = settings.has('allowed_ids');
  const allowedFromDb = (settings.get('allowed_ids') ?? '').trim();
  const allowedFromEnv = (env?.TELEGRAM_ALLOWED_IDS ?? '').trim();
  const allowedSource = hasAllowedIdsInDb ? allowedFromDb : allowedFromEnv;
  const allowedIds = new Set(parseIdList(allowedSource));

  const defaultChatFromDb = (settings.get('default_chat_id') ?? '').trim();
  const defaultChatFromEnv = (env?.TELEGRAM_DEFAULT_CHAT_ID ?? '').trim();
  const testChatFromDb = (settings.get('test_chat_id') ?? '').trim();
  const testChatFromEnv = (env?.TELEGRAM_TEST_CHAT_ID ?? '').trim();
  const targetMode = (settings.get('target_mode') ?? '').trim() || 'All Allowed IDs';

  return {
    token,
    allowedIds,
    targetMode,
    defaultChatId: defaultChatFromDb || defaultChatFromEnv,
    testChatId: testChatFromDb || testChatFromEnv,
    forwardInbound: parseBoolean(settings.get('forward_inbound'), true)
  };
}

function parseTelegramUpdate(raw: unknown): TelegramUpdate | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return raw as TelegramUpdate;
}

function parseCommand(text: string): { name: string; args: string[] } {
  const cleaned = text.trim();
  if (!cleaned) {
    return { name: '', args: [] };
  }
  const noSlash = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
  const parts = noSlash.split(/\s+/);
  const commandName = (parts[0] ?? '').toLowerCase().split('@')[0];
  return { name: commandName, args: parts.slice(1) };
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

function parseIdList(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTargetChatIds(config: TelegramConfig): string[] {
  const ids = new Set<string>();
  const mode = config.targetMode.toLowerCase();

  if (mode.includes('test') && config.testChatId) {
    ids.add(config.testChatId);
  }
  if (mode.includes('default') && config.defaultChatId) {
    ids.add(config.defaultChatId);
  }
  if (mode.includes('all') || (!mode.includes('test') && !mode.includes('default'))) {
    for (const id of config.allowedIds) ids.add(id);
  }

  if (ids.size === 0) {
    if (config.defaultChatId) ids.add(config.defaultChatId);
    if (config.testChatId) ids.add(config.testChatId);
    for (const id of config.allowedIds) ids.add(id);
  }

  return Array.from(ids);
}

function isAllowedTelegramUser(config: TelegramConfig, telegramUserId: string): boolean {
  if (!telegramUserId || config.allowedIds.size === 0) {
    return false;
  }
  return config.allowedIds.has(telegramUserId);
}

function parseWebhookAllowedUpdates(value: string): string[] {
  const items = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return ['message', 'callback_query'];
  }

  return Array.from(new Set(items));
}

function validateUsername(usernameRaw: string, command: 'adduser' | 'inbox' | 'reset'): string | null {
  if (!usernameRaw) {
    return `Usage: ${command} <username>`;
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
  if (!domain || domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

async function resolveUserDomain(db: D1Database, envDomain: string | undefined): Promise<string> {
  const fromDb = sanitizeDomain(await getWorkerSettingValue(db, 'user_email_domain'));
  if (isValidDomain(fromDb)) return fromDb;

  const fromEnv = sanitizeDomain(envDomain ?? '');
  if (isValidDomain(fromEnv)) return fromEnv;

  return 'mailflare.local';
}

async function findUserByUsername(db: D1Database, username: string): Promise<{ id: string; email: string } | null> {
  const row = await db
    .prepare(
      `
      SELECT id, email
      FROM users
      WHERE lower(substr(email, 1, instr(email, '@') - 1)) = lower(?)
         OR lower(display_name) = lower(?)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
    )
    .bind(username, username)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return { id: String(row.id ?? ''), email: String(row.email ?? '') };
}

async function loadWorkerSettingsMap(db: D1Database): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { results } = await db.prepare('SELECT key, value FROM worker_settings').all<Record<string, unknown>>();
  for (const row of results ?? []) {
    const key = String(row.key ?? '');
    if (!key) continue;
    map.set(key, String(row.value ?? ''));
  }
  return map;
}

async function persistWebhookSnapshot(db: D1Database, snapshot: TelegramWebhookInfoSnapshot): Promise<void> {
  const entries: Array<[string, string]> = [
    ['webhook_url', snapshot.url],
    ['webhook_ip_address', snapshot.ipAddress],
    ['webhook_max_connections', String(snapshot.maxConnections)],
    ['webhook_pending_updates', String(snapshot.pendingUpdates)],
    ['webhook_allowed_updates', snapshot.allowedUpdates.join(',')]
  ];

  await Promise.all(
    entries.map(([key, value]) =>
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
}

async function getWorkerSettingValue(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM worker_settings WHERE key = ? LIMIT 1').bind(key).first<{ value: string | null }>();
  return String(row?.value ?? '');
}

async function isDuplicateUpdate(db: D1Database, updateId: number): Promise<boolean> {
  const result = await db
    .prepare(
      `
      INSERT INTO telegram_webhook_updates (update_id, processed_at)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(update_id) DO NOTHING
    `
    )
    .bind(updateId)
    .run();

  const changes = Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
  return changes === 0;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}

function extractUsername(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return email;
  return email.slice(0, atIndex);
}

/**
 * Extracts a clean email address from a potentially decorated sender/recipient string.
 * Handles formats like:
 *   - `"Display Name" <user@example.com>` → `user@example.com`
 *   - `<user@example.com>` → `user@example.com`
 *   - `user@example.com` → `user@example.com`
 */
function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const angleBracket = trimmed.match(/<([^>]+)>/);
  if (angleBracket?.[1]) {
    return angleBracket[1].trim();
  }
  return trimmed;
}

function escapeMarkdownV2(value: string): string {
  return value.replace(MARKDOWN_V2_SPECIAL, '\\$1');
}

function escapeCode(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function sanitizeCodeBlock(value: string): string {
  return value.replace(/```/g, "'''");
}

function inlineCodeMd(value: string): string {
  return '`' + escapeCode(value) + '`';
}

function formatUnixTimestamp(unixSeconds: number | undefined): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return '';
  }
  try {
    return new Date(unixSeconds * 1000).toISOString();
  } catch {
    return '';
  }
}
