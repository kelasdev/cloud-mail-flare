declare global {
  namespace App {
    interface Locals {
      authenticated: boolean;
      sessionUserId?: string;
      sessionEmail?: string;
      sessionRole?: 'owner' | 'member';
    }

    interface Platform {
      env: {
        DB?: D1Database;
        MAILFLARE_USER_DOMAIN?: string;
        TELEGRAM_BOT_TOKEN?: string;
        TELEGRAM_WEBHOOK_SECRET?: string;
        TELEGRAM_ALLOWED_IDS?: string;
        TELEGRAM_DEFAULT_CHAT_ID?: string;
        TELEGRAM_TEST_CHAT_ID?: string;
        TELEGRAM_INTERNAL_SECRET?: string;
        TURNSTILE_SECRET_KEY?: string;
        TURNSTILE_SITE_KEY?: string;
        SETUP_TOKEN?: string;
      };
    }
  }
}

export {};
