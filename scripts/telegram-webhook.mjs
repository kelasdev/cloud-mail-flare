#!/usr/bin/env node

const COMMANDS = new Set(['set', 'delete', 'info', 'help', 'commands']);

function parseArgs(argv) {
  const out = {
    _: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }

    const rawKey = token.slice(2);
    const eqIndex = rawKey.indexOf('=');
    if (eqIndex >= 0) {
      const key = rawKey.slice(0, eqIndex);
      const value = rawKey.slice(eqIndex + 1);
      out[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[rawKey] = 'true';
      continue;
    }

    out[rawKey] = next;
    i += 1;
  }

  return out;
}

function toBoolean(input, fallback = false) {
  if (input === undefined) {
    return fallback;
  }
  const value = String(input).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  return fallback;
}

function toNumber(input, fallback) {
  if (input === undefined || input === '') {
    return fallback;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(input) {
  if (!input) {
    return [];
  }
  return String(input)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function showHelp() {
  console.log(`
Telegram Webhook Utility

Usage:
  node scripts/telegram-webhook.mjs <set|delete|info> --token <BOT_TOKEN> [options]

Token source priority:
  1) --token <BOT_TOKEN>
  2) TELEGRAM_BOT_TOKEN env

Commands:
  set       Set webhook url
  delete    Delete webhook
  info      Get webhook info
  commands  Update bot commands menu

Global options:
  --token <BOT_TOKEN>                       Optional if TELEGRAM_BOT_TOKEN is set

Options for "set":
  --url <url>                               Required if TELEGRAM_WEBHOOK_URL not set
  --secret <secret>                         Optional secret_token
  --allowed-updates <a,b,c>                 Default: message,callback_query
  --max-connections <number>                Optional
  --ip-address <ip>                         Optional
  --drop-pending-updates <true|false>       Optional

Options for "delete":
  --drop-pending-updates <true|false>       Optional (default: false)

Env fallback:
  TELEGRAM_WEBHOOK_URL
  TELEGRAM_WEBHOOK_SECRET
  TELEGRAM_WEBHOOK_ALLOWED_UPDATES
  TELEGRAM_WEBHOOK_MAX_CONNECTIONS
  TELEGRAM_WEBHOOK_IP_ADDRESS
  TELEGRAM_WEBHOOK_DROP_PENDING_UPDATES
`.trim());
}

async function telegramApi(token, method, payload = undefined, httpMethod = 'POST') {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: httpMethod,
    headers: {
      'content-type': 'application/json'
    },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Telegram API returned non-JSON response (${response.status}): ${text}`);
  }

  if (!response.ok || !json?.ok) {
    const description = json?.description ? `: ${json.description}` : '';
    throw new Error(`Telegram API ${method} failed (${response.status})${description}`);
  }

  return json.result;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const command = (args._[0] || 'help').toLowerCase();

  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown command "${command}". Use "help".`);
  }

  if (command === 'help') {
    showHelp();
    return;
  }

  const token = String(args.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('Missing bot token. Pass --token or set TELEGRAM_BOT_TOKEN.');
  }

  if (command === 'info') {
    const result = await telegramApi(token, 'getWebhookInfo', undefined, 'GET');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'delete') {
    const dropPendingUpdates = toBoolean(
      args['drop-pending-updates'] ?? process.env.TELEGRAM_WEBHOOK_DROP_PENDING_UPDATES,
      false
    );
    const result = await telegramApi(token, 'deleteWebhook', {
      drop_pending_updates: dropPendingUpdates
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'commands') {
    const payload = {
      commands: [
        { command: "access", description: "Generate one-time access code login" },
        { command: "adduser", description: "Create a new user e.g. /adduser <username>" },
        { command: "listuser", description: "List all registered users" },
        { command: "inbox", description: "View user inbox: /inbox <username>" },
        { command: "readmail", description: "Read specific email: /readmail <email_id>" },
        { command: "reset", description: "Reset user password: /reset <username>" },
        { command: "help", description: "Show help and available commands" }
      ]
    };
    const result = await telegramApi(token, 'setMyCommands', payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const webhookUrl = String(args.url ?? process.env.TELEGRAM_WEBHOOK_URL ?? '').trim();
  if (!webhookUrl) {
    throw new Error('Missing webhook URL. Pass --url or set TELEGRAM_WEBHOOK_URL.');
  }

  const allowedUpdatesRaw = args['allowed-updates'] ?? process.env.TELEGRAM_WEBHOOK_ALLOWED_UPDATES ?? 'message,callback_query';
  const payload = {
    url: webhookUrl,
    allowed_updates: splitList(allowedUpdatesRaw)
  };

  const secretToken = String(args.secret ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  if (secretToken) {
    payload.secret_token = secretToken;
  }

  const maxConnections = toNumber(args['max-connections'] ?? process.env.TELEGRAM_WEBHOOK_MAX_CONNECTIONS, NaN);
  if (Number.isFinite(maxConnections) && maxConnections > 0) {
    payload.max_connections = Math.floor(maxConnections);
  }

  const ipAddress = String(args['ip-address'] ?? process.env.TELEGRAM_WEBHOOK_IP_ADDRESS ?? '').trim();
  if (ipAddress) {
    payload.ip_address = ipAddress;
  }

  const dropPendingUpdates = toBoolean(
    args['drop-pending-updates'] ?? process.env.TELEGRAM_WEBHOOK_DROP_PENDING_UPDATES,
    false
  );
  if (dropPendingUpdates) {
    payload.drop_pending_updates = true;
  }

  const result = await telegramApi(token, 'setWebhook', payload);
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
