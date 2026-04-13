# Full Deployment Guide (Cloudflare Worker + D1 + Email Routing)

Dokumen ini adalah panduan deploy production end-to-end untuk Cloud Mail Flare.
Ikuti urutan langkah dari atas ke bawah agar tidak ada konfigurasi yang terlewat.

## 1) Scope dan Arsitektur

Aplikasi berjalan dalam 1 Cloudflare Worker untuk:

- UI SvelteKit
- API (`/api/*`)
- D1 database access
- Email Routing handler (`email()`)

Pemisahan domain di production:

- App/UI/API domain: `https://<app-domain>`
- Mail domain user: `username@<mail-domain>`

Contoh:

- `APP_DOMAIN=mail.example.com`
- `MAIL_DOMAIN=example.com`

Catatan:

- `<app-domain>` adalah hostname URL app (bukan alamat email).
- Format email user mengikuti `MAILFLARE_USER_DOMAIN` atau `worker_settings.user_email_domain`.

## 2) Prasyarat

- Node.js 20+
- `pnpm` terpasang
- Akun Cloudflare dengan akses Workers, D1, Email Routing
- Domain sudah ada di Cloudflare zone

## 3) Nilai yang Wajib Disiapkan

Siapkan dulu nilai ini sebelum deploy:

- `APP_DOMAIN` (contoh: `mail.example.com`)
- `MAIL_DOMAIN` (contoh: `example.com`)
- `WORKER_NAME` (contoh: `mailflare-web`)
- `D1_DB_NAME` (contoh: `mailflarecloud-db`)
- `SETUP_TOKEN` (untuk bootstrap admin pertama)
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Opsional (jika pakai Telegram):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_INTERNAL_SECRET`

Catatan Telegram:

- `TELEGRAM_INTERNAL_SECRET` hanya dibutuhkan untuk caller eksternal/non-login ke `/api/telegram/notify-email`.
- Inbound email internal Worker ke DB tetap bisa jalan tanpa secret ini.

## 4) Install Dependency dan Login Wrangler

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

Jika `whoami` gagal, ulangi `wrangler login`.

## 5) Konfigurasi `wrangler.toml`

Pastikan `wrangler.toml` sudah sesuai.

Contoh baseline:

```toml
name = "<worker-name>"
main = ".svelte-kit/cloudflare/_worker.js"
compatibility_date = "2026-04-07"
compatibility_flags = ["nodejs_compat"]
workers_dev = false
preview_urls = false

[[routes]]
pattern = "<app-domain>"
custom_domain = true

[assets]
directory = ".svelte-kit/cloudflare"
binding = "ASSETS"

[vars]
MAILFLARE_USER_DOMAIN = "<mail-domain>"
MAILFLARE_NOTIFY_URL = "https://<app-domain>"

[[d1_databases]]
binding = "DB"
database_name = "<d1-db-name>"
database_id = "<d1-database-id>"
```

Validasi cepat:

- `name` sama dengan nama Worker yang akan dideploy.
- `[[routes]].pattern` adalah hostname app production.
- `binding` D1 harus `DB`.
- `MAILFLARE_NOTIFY_URL` harus URL app production aktif.

## 6) Buat D1 dan Apply Schema

Jika DB belum ada:

```bash
pnpm exec wrangler d1 create <d1-db-name>
```

Setelah dapat `database_id`, isi ke `wrangler.toml`, lalu apply schema remote:

```bash
pnpm exec wrangler d1 execute <d1-db-name> --remote --file ./schema.sql
```

## 7) Set Secret Production

Set secret wajib:

```bash
pnpm exec wrangler secret put SETUP_TOKEN
pnpm exec wrangler secret put TURNSTILE_SITE_KEY
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
```

Jika pakai Telegram:

```bash
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
pnpm exec wrangler secret put TELEGRAM_INTERNAL_SECRET
pnpm exec wrangler secret put TELEGRAM_ALLOWED_IDS
```

Catatan penting:

- `TELEGRAM_BOT_TOKEN` adalah syarat utama agar bot bisa kirim pesan.
- `TELEGRAM_WEBHOOK_SECRET` sangat disarankan untuk verifikasi request dari Telegram.
- `TELEGRAM_INTERNAL_SECRET` hanya wajib jika endpoint `/api/telegram/notify-email` dipanggil oleh caller eksternal/non-login.
- `TELEGRAM_ALLOWED_IDS` tidak wajib sebagai secret production. Kelola whitelist dari UI `/worker/settings`.
- `TELEGRAM_DEFAULT_CHAT_ID` dan `TELEGRAM_TEST_CHAT_ID` opsional sebagai fallback env; umumnya dikelola lewat UI.

Prioritas konfigurasi Telegram saat runtime:

- `allowed_ids`: jika key `allowed_ids` sudah pernah tersimpan di DB, nilai DB jadi authoritative (termasuk saat kosong). Jika belum pernah ada di DB, baru fallback ke env `TELEGRAM_ALLOWED_IDS`.
- `default_chat_id` dan `test_chat_id`: pakai nilai DB jika terisi; jika kosong baru fallback ke env `TELEGRAM_DEFAULT_CHAT_ID` dan `TELEGRAM_TEST_CHAT_ID`.
- `forward_inbound`: default `false` jika belum pernah disimpan ke DB, jadi harus diaktifkan manual di `/worker/settings` bila ingin forward email masuk ke Telegram.

Opsional fallback env Telegram (jika ingin dipasang di Worker env):

```bash
pnpm exec wrangler secret put TELEGRAM_DEFAULT_CHAT_ID
pnpm exec wrangler secret put TELEGRAM_TEST_CHAT_ID
```

Generate secret random (opsional):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 8) Pre-Deploy Validation

```bash
pnpm check
pnpm build
```

Jika gagal, perbaiki dulu sebelum deploy.

## 9) Deploy ke Cloudflare

```bash
pnpm run deploy
```

Expected result:

- Build sukses
- Worker upload sukses
- Trigger menampilkan custom domain

Catatan proses deploy:

- `pnpm run deploy` menjalankan build SvelteKit
- Script `postbuild-add-email-handler.mjs` inject handler `email()`
- Wrangler deploy ke Cloudflare

Jika muncul `No deploy targets`:

- Cek `[[routes]]` sudah benar
- Pastikan domain aktif di zone yang sama
- `workers_dev` tetap `false` untuk custom domain production

## 10) Bootstrap Admin Pertama

Jika tabel `users` masih kosong:

1. Buka `https://<app-domain>/auth/login`
2. Selesaikan Turnstile CAPTCHA
3. Isi email + password admin
4. Isi field `Setup Token (First Login Only)` dengan nilai `SETUP_TOKEN`

Jika token salah, akan muncul error `Invalid setup token`.

## 11) Konfigurasi Worker Settings (Admin UI)

Setelah login admin, buka `/worker/settings` dan isi sesuai kebutuhan:

- `User Email Domain`
- Telegram settings (jika dipakai):
  - `Bot Token`
  - `Webhook Secret`
  - `Allowed IDs`
  - `Default Chat ID` / `Test Chat ID`
  - `Target Mode`
  - `Forward inbound`

Rekomendasi:

- Simpan konfigurasi Telegram dari UI agar state tersimpan di DB.

## 12) Setup Telegram Webhook (Opsional)

Prasyarat sebelum set webhook:

- Buat bot di `@BotFather` lalu simpan `BOT_TOKEN`.
- Akun Telegram target harus pernah memulai chat dengan bot (klik `Start`) agar bot bisa mengirim pesan.
- Dapatkan Telegram user ID (contoh via `@userinfobot`) untuk diisi ke `Allowed IDs` / target chat.

Opsi A (disarankan):

- Dari `/worker/settings`, isi URL webhook `https://<app-domain>/api/telegram/webhook`
- Klik `Connect Webhook`

Opsi B (CLI):

```bash
pnpm telegram:webhook:set -- \
  --token "<BOT_TOKEN>" \
  --url "https://<app-domain>/api/telegram/webhook" \
  --secret "<WEBHOOK_SECRET>" \
  --allowed-updates "message,callback_query"
```

Verifikasi webhook:

```bash
pnpm telegram:webhook:info -- --token "<BOT_TOKEN>"
```

Opsional: set command menu bot

```bash
pnpm telegram:commands -- --token "<BOT_TOKEN>"
```

Checklist cepat setelah webhook:

- `Webhook Status` di `/worker/settings` menunjukkan `Connected`.
- Command `/help` atau `/start` di Telegram dibalas oleh bot.
- Tombol `Test Connection` di `/worker/settings` sukses kirim pesan.

## 13) Setup Email Routing ke Worker

Tujuan:

- Menerima email `username@<mail-domain>`
- Worker memproses inbound email ke D1
- Opsional forward notifikasi ke Telegram

Langkah Cloudflare Dashboard:

1. Buka `Email -> Email Routing`
2. Pastikan mail domain terverifikasi
3. Buat inbound rule catch-all `*@<mail-domain>`
4. Destination: `Send to a Worker` -> pilih `WORKER_NAME`

Runtime behavior:

- Recipient divalidasi ke tabel `users`
- Recipient tidak dikenal ditolak (`Unknown recipient`)
- Recipient valid disimpan ke `emails`
- Jika `forward_inbound=true`, notifikasi Telegram ikut dikirim

## 14) Smoke Test Production

Ganti `<APP_URL>` dengan `https://<app-domain>`.

```bash
curl <APP_URL>/api/health
curl <APP_URL>/api/dashboard
curl <APP_URL>/api/users
curl <APP_URL>/api/worker-settings
```

Checklist minimum:

- [ ] `/api/health` sukses
- [ ] endpoint auth-protected return `401` (bukan `500`) saat tanpa cookie
- [ ] login admin via browser berhasil
- [ ] email ke user terdaftar masuk ke inbox
- [ ] email ke recipient tidak dikenal tidak diproses
- [ ] jika Telegram aktif, test message dan notify-email sukses

Checklist tambahan jika Telegram aktif:

- [ ] `Allowed IDs` sudah benar di `/worker/settings` (atau fallback env jika DB key belum ada)
- [ ] `Target Mode` sudah sesuai (`All Allowed IDs` / `Default` / `Test`)
- [ ] `Forward inbound` sudah aktif
- [ ] `Default Chat ID` / `Test Chat ID` sesuai skenario pengiriman
- [ ] Command `apikey` dari Telegram berhasil dijalankan oleh user yang di-allow

## 15) Troubleshooting Cepat

Pantau log realtime (langkah pertama saat ada masalah):

```bash
pnpm exec wrangler tail --format pretty
```

Kasus umum:

`wrangler whoami` gagal:

- login ulang `pnpm exec wrangler login`

D1 tidak terbaca:

- cek `database_id` di `wrangler.toml`
- cek binding D1 harus `DB`
- pastikan schema remote sudah di-apply

Deploy sukses tapi domain tidak aktif:

- cek `[[routes]]`
- pastikan domain ada di zone Cloudflare yang sama

Email tidak masuk ke Worker:

- pastikan Email Routing destination = `Send to a Worker`
- cek worker name sesuai `wrangler.toml`
- deploy ulang (`pnpm run deploy`) bila perlu

Email inbound selalu reject:

- cek recipient memang ada di `users.email`
- cek `MAILFLARE_USER_DOMAIN` / `user_email_domain` sesuai domain aktif

Telegram notify tidak terkirim:

- cek `forward_inbound` aktif di `/worker/settings`
- cek target chat (`Allowed IDs`, `Default Chat ID`, `Test Chat ID`)
- jika caller eksternal ke `/api/telegram/notify-email`, pastikan `TELEGRAM_INTERNAL_SECRET` + header `x-mailflare-telegram-secret` benar
- cek `MAILFLARE_NOTIFY_URL` valid

Login gagal:

- pastikan Turnstile token valid
- cek `TURNSTILE_SITE_KEY` dan `TURNSTILE_SECRET_KEY` sudah terpasang

## 16) Final Checklist (Go-Live)

- [ ] `wrangler.toml` final dan benar
- [ ] D1 schema sudah remote apply
- [ ] semua secret wajib sudah terpasang
- [ ] deploy sukses ke custom domain
- [ ] bootstrap admin sukses
- [ ] worker settings tersimpan
- [ ] email routing aktif ke worker
- [ ] smoke test endpoint lolos
- [ ] log runtime bersih dari error kritis
