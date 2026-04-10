# Dokumentasi Integrasi Bot Telegram

Dokumen ini menjelaskan integrasi Telegram Bot pada project `cloud-mail-flare`, termasuk webhook, command admin, notifikasi, access code, dan endpoint pendukung.

Untuk urutan deploy production end-to-end (termasuk domain, D1, secret, dan Email Routing), gunakan panduan:
- `docs/deploy-fullstack-cloudflare.md`

## 1) Ringkasan Fitur

Integrasi Telegram di project ini menyediakan:

1. Notifikasi email masuk dengan format MarkdownV2:
- Menampilkan ringkasan rapi: subjek, pengirim, penerima, waktu, dan email id.
- Menampilkan snippet singkat + aksi cepat `/readmail <email_id>`.
- Menyediakan inline keyboard aksi: `Star`, `Archive`, `Mark as Read`, `Soft Delete`.

2. Notifikasi user baru saat dibuat dari dashboard admin:
- Mengirim kredensial `username/email/password` dalam blok monospace agar mudah disalin.

3. Command admin via Telegram:
- `adduser <username>`
- `listuser <asc|desc>`
- `inbox <username>`
- `readmail <email_id>`
- `access`
- `reset <username>`

4. Login access code (one-time):
- Command `access` di Telegram membuat kode sekali pakai.
- Kode diredeem lewat endpoint `/api/auth/access-code` dan menghasilkan session login.

5. Inbound Email Routing aman untuk catch-all:
- Email untuk recipient yang tidak terdaftar di tabel `users.email` akan di-drop/reject.
- Hanya recipient valid yang diteruskan ke flow notifikasi Telegram.

## 2) Arsitektur & Komponen

### File utama

- Service inti Telegram:
  - `src/lib/server/telegram.ts`
- Util access code:
  - `src/lib/server/access-code.ts`
- Webhook Telegram:
  - `src/routes/api/telegram/webhook/+server.ts`
- Trigger notifikasi email masuk:
  - `src/routes/api/telegram/notify-email/+server.ts`
- Inbound Email Worker patch (menambah handler `email()` saat build):
  - `scripts/postbuild-add-email-handler.mjs`
- Redeem access code:
  - `src/routes/api/auth/access-code/+server.ts`
- Integrasi notifikasi user baru:
  - `src/routes/api/users/+server.ts`
- UI access code:
  - `src/lib/components/organisms/AccessCodeModal.svelte`
- Public route guard (tanpa login):
  - `src/hooks.server.ts`

### Tabel DB yang digunakan

Pastikan migration `schema.sql` sudah di-apply, terutama tabel berikut:

- `worker_settings`
- `telegram_webhook_updates` (dedup update Telegram)
- `access_codes` (one-time code)
- `access_sessions` (audit sesi access-code)
- `email_status_history` (audit aksi email)
- `users`, `emails`, `login_sessions`

## 3) Konfigurasi

Konfigurasi diambil dari kombinasi `worker_settings` (DB) dan env vars dengan aturan:

- `bot_token`: DB (jika terisi) -> env `TELEGRAM_BOT_TOKEN`
- `allowed_ids`: jika key `allowed_ids` sudah ada di DB maka nilai DB dipakai (termasuk saat kosong), jika belum ada baru fallback ke env `TELEGRAM_ALLOWED_IDS`
- `default_chat_id` / `test_chat_id`: DB (jika terisi) -> env fallback

### Integrasi Worker Settings (UI/Admin)

Halaman worker settings sekarang sudah terhubung dengan runtime Telegram untuk:

- Menyimpan konfigurasi routing dan target chat.
- Menyimpan `bot_token` (opsional update, tidak ditampilkan plaintext).
- Menyimpan `webhook_secret` (opsional update, tidak ditampilkan plaintext).
- Menjalankan test koneksi bot via tombol **Test Connection**.
- Menjalankan test `notify-email` (payload email sintetis) via tombol **Test Connection**.
- Menampilkan status webhook live (hasil `getWebhookInfo`) saat data tersedia.

### Env vars yang didukung

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_IDS`
- `TELEGRAM_DEFAULT_CHAT_ID`
- `TELEGRAM_TEST_CHAT_ID`
- `TELEGRAM_INTERNAL_SECRET`
- `MAILFLARE_NOTIFY_URL`

Gunakan `wrangler secret` untuk nilai rahasia (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_INTERNAL_SECRET`).
`TELEGRAM_ALLOWED_IDS`, `TELEGRAM_DEFAULT_CHAT_ID`, dan `TELEGRAM_TEST_CHAT_ID` opsional sebagai fallback awal.
`MAILFLARE_NOTIFY_URL` wajib untuk forward event Email Routing ke endpoint `/api/telegram/notify-email`.

### Key `worker_settings` yang dipakai

**Konfigurasi bot:**
- `bot_token`
- `allowed_ids`
- `target_mode`
- `default_chat_id`
- `test_chat_id`
- `forward_inbound`
- `webhook_secret`
- `user_email_domain` (dipakai saat `adduser`)
- `bot_status` (status ringkas konfigurasi bot)

**Konfigurasi webhook (disimpan otomatis saat connect/snapshot):**
- `webhook_url` — URL webhook aktif
- `webhook_allowed_updates` — jenis update yang di-subscribe (contoh: `message,callback_query`)
- `webhook_max_connections` — batas koneksi webhook (opsional)
- `webhook_ip_address` — batasan IP Telegram server (opsional)
- `webhook_pending_updates` — jumlah update tertunda (snapshot info)

### Catatan penting konfigurasi

- `allowed_ids` sekarang dikelola dari UI (`Allowed IDs (DB)`), bukan label ENV.
- Jika key `allowed_ids` sudah pernah disimpan di DB dan nilainya kosong, command Telegram akan dianggap unauthorized.
- Jika `webhook_secret`/`TELEGRAM_WEBHOOK_SECRET` tidak diisi, verifikasi header secret webhook tidak dipaksa.
- `MAILFLARE_USER_DOMAIN` dipakai untuk membentuk email user (`username@domain`), bukan untuk URL UI.
- `MAILFLARE_NOTIFY_URL` harus berisi URL UI/API yang aktif (contoh `https://<app-domain>`).
- `target_mode` menentukan target notifikasi:
  - mode mengandung `all` -> kirim ke semua allowed IDs
  - mode mengandung `default` -> kirim ke `default_chat_id`
  - mode mengandung `test` -> kirim ke `test_chat_id`

## 4) Setup Telegram Webhook

Ganti nilai berikut:

- `<BOT_TOKEN>`: token bot dari BotFather
- `<PUBLIC_URL>`: URL deploy aplikasi
- `<WEBHOOK_SECRET>`: secret webhook (opsional tapi direkomendasikan)

Contoh set webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<PUBLIC_URL>/api/telegram/webhook",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Cek status webhook:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

### Alternatif cepat dengan script bawaan project

Project menyediakan script helper:

- `pnpm telegram:webhook:set`
- `pnpm telegram:webhook:delete`
- `pnpm telegram:webhook:info`

Contoh penggunaan:

```bash
# set webhook
pnpm telegram:webhook:set -- \
  --token "<BOT_TOKEN>" \
  --url "<PUBLIC_URL>/api/telegram/webhook" \
  --secret "<WEBHOOK_SECRET>" \
  --allowed-updates "message,callback_query"

# info webhook
pnpm telegram:webhook:info -- --token "<BOT_TOKEN>"

# delete webhook
pnpm telegram:webhook:delete -- \
  --token "<BOT_TOKEN>" \
  --drop-pending-updates true
```

Script file:

- `scripts/telegram-webhook.mjs`

## 5) Command Telegram

Semua command diproses oleh webhook route `POST /api/telegram/webhook`.

> **Catatan:** Hanya Telegram user ID yang terdaftar di `allowed_ids` yang dapat menggunakan command apapun. Pengirim yang tidak terdaftar akan mendapat balasan `Unauthorized Telegram user ID.`

### Daftar Command

| Command | Fungsi |
|---|---|
| `adduser <username>` | Buat user baru |
| `listuser <asc\|desc>` | Tampilkan daftar user |
| `inbox <username>` | Tampilkan 10 email terbaru user |
| `readmail <email_id>` | Baca detail email |
| `access` | Buat one-time login code |
| `reset <username>` | Reset password user |
| `/help` atau `/start` | Tampilkan daftar command |

### 5.1 `adduser <username>`

Membuat user baru, generate password aman, dan membalas kredensial.

Validasi username:

- panjang 3-64
- hanya `a-z`, `0-9`, `.`, `_`, `-`
- tidak boleh mengandung `@`
- harus diawali/diakhiri karakter alfanumerik

Domain email mengikuti `user_email_domain` -> env `MAILFLARE_USER_DOMAIN` -> fallback `mailflare.local`.

### 5.2 `listuser <asc|desc>`

Menampilkan daftar user max 10 item per halaman.

- Default order: `desc`
- Pagination memakai inline keyboard `Prev/Next`.

### 5.3 `inbox <username>`

Menampilkan 10 email inbox terbaru milik user (`deleted_at IS NULL`), berisi:

- `email id`
- `from`
- `subject`
- `snippet`

### 5.4 `readmail <email_id>`

Menampilkan detail email lengkap:

- meta pengirim/penerima/id
- subjek
- user owner
- waktu diterima
- body text (hasil fallback: `body_text` -> `parsed_text` -> `snippet`)

Jika belum terbaca, status `is_read` diupdate otomatis.

### 5.5 `access`

Membuat access code one-time format `MF-XXXX-XXXX-XXXX`.

- TTL: 10 menit
- Hanya bisa dipakai sekali
- Kode aktif lama milik user Telegram yang sama otomatis dinonaktifkan sebelum kode baru dibuat
- Karakter yang digunakan: `A-Z` dan `2-9` — huruf `I`, `O` serta angka `1`, `0` sengaja dihapus untuk menghindari kebingungan visual antara huruf dan angka yang mirip

### 5.6 `reset <username>`

### 5.7 `/help` dan `/start`

Bot akan membalas dengan daftar semua command yang tersedia. Respons yang sama juga ditampilkan jika user mengirim command yang tidak dikenal.

Reset password user lalu mengirim password baru dalam blok monospace.

## 6) Inline Keyboard Email Actions

Pada notifikasi email masuk dan hasil `readmail`, bot menampilkan tombol:

- `Star` -> set `is_starred = 1`
- `Archive` -> set `is_archived = 1`
- `Mark as Read` -> set `is_read = 1`
- `Soft Delete` -> set `deleted_at = CURRENT_TIMESTAMP`

Setiap aksi dicatat ke `email_status_history` (best effort).

## 7) Endpoint API Terkait

### 7.1 `POST /api/telegram/webhook`

Menerima update Telegram (`message` dan `callback_query`).

Header opsional/required sesuai konfigurasi:

- `x-telegram-bot-api-secret-token: <WEBHOOK_SECRET>`

Respons sukses:

```json
{ "ok": true }
```

### 7.2 `POST /api/telegram/notify-email`

Trigger notifikasi email masuk dari sistem ingest email eksternal/internal.

Jika caller tidak login session dashboard, wajib header:

- `x-mailflare-telegram-secret: <TELEGRAM_INTERNAL_SECRET>`

Body:

```json
{
  "emailId": "eml_123",
  "sender": "sender@example.com",
  "recipient": "alex@mailflare.local",
  "subject": "Hello",
  "snippet": "Ringkasan isi email...",
  "bodyText": "Isi lengkap email (opsional)",
  "receivedAt": "2026-04-10T13:00:00Z",
  "rawMime": "Raw MIME string (opsional)",
  "contentType": "text/plain (opsional)",
  "headersJson": "{} (opsional)",
  "skipPersist": false
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `emailId` | ✅ | ID unik email |
| `sender` | ✅ | Alamat email pengirim |
| `recipient` | ✅ | Alamat email penerima |
| `subject` | ❌ | Subjek email |
| `snippet` | ❌ | Ringkasan isi email |
| `bodyText` | ❌ | Isi teks email lengkap |
| `receivedAt` | ❌ | Waktu diterima (ISO 8601) |
| `rawMime` | ❌ | Raw MIME seluruh email |
| `contentType` | ❌ | Content-Type header email |
| `headersJson` | ❌ | Header email dalam JSON string |
| `skipPersist` | ❌ | Jika `true`, email tidak disimpan ke DB — hanya notifikasi Telegram yang dikirim (berguna untuk testing) |

Respons:

```json
{
  "ok": true,
  "sentTo": 1,
  "stored": true
}
```

| Field | Keterangan |
|---|---|
| `sentTo` | Jumlah target chat yang berhasil dikirim notifikasi |
| `stored` | `true` jika email berhasil disimpan ke DB, `false` jika `skipPersist: true` |

### 7.3 `POST /api/worker-settings/test-telegram`

Mengirim pesan uji Telegram dari panel admin worker settings.

Aturan target chat:

1. `test_chat_id` jika ada
2. `default_chat_id` jika tidak ada test chat
3. allowed id pertama jika dua nilai di atas kosong

Respons sukses:

```json
{
  "ok": true,
  "payload": {
    "ok": true,
    "message": "Test message sent successfully",
    "targetChatId": "6880046961",
    "webhook": {
      "connected": true,
      "url": "https://example.com/api/telegram/webhook",
      "ipAddress": "149.154.x.x",
      "maxConnections": 40,
      "pendingUpdates": 0,
      "allowedUpdates": ["message", "callback_query"],
      "lastErrorAt": "",
      "lastErrorMessage": "",
      "source": "live"
    }
  }
}
```

Catatan implementasi tombol di UI:

- Tombol **Test Connection** memanggil `/api/worker-settings/test-telegram` terlebih dulu.
- Jika sukses, UI langsung mengirim payload uji ke `/api/telegram/notify-email` untuk memverifikasi flow notifikasi email masuk (termasuk inline keyboard actions).
- Payload uji memakai `emailId` sintetis seperti `test-notify-<timestamp>`.

### 7.4 `POST /api/auth/access-code`

Redeem one-time code dari command `access`.

Body:

```json
{
  "code": "MF-ABCD-EFGH-JKLM",
  "turnstileToken": "<token_dari_captcha_cloudflare_turnstile>"
}
```

> ⚠️ **Field `turnstileToken` wajib diisi** — jika kosong, endpoint mengembalikan 400. Halaman `/auth/access-code` menangani ini secara otomatis melalui widget Cloudflare Turnstile.

Jika valid:

- `access_codes.used_at` ditandai (kode tidak bisa dipakai ulang)
- `login_sessions` baru dibuat untuk user owner (user pertama berdasarkan `created_at ASC`)
- Record audit disimpan ke tabel `access_sessions` (berisi referensi ke `code_id`, bukan dipakai untuk autentikasi request)
- Cookie `mailflare_session` diset dengan token dari `login_sessions`

Respons:

```json
{
  "ok": true,
  "user": {
    "id": "...",
    "email": "owner@example.com"
  }
}
```

### 7.5 `POST /api/users`

Flow create user dashboard kini otomatis memanggil notifikasi Telegram dan mengembalikan info jumlah target terkirim:

```json
{
  "ok": true,
  "user": { "...": "..." },
  "credentials": { "username": "...", "email": "...", "password": "..." },
  "telegram": { "sentTo": 1 }
}
```

## 8) Security Model

1. Whitelist Telegram user ID
- Command dan callback hanya diproses jika `from.id` ada di `allowed_ids`.

2. Webhook secret
- Verifikasi via header `x-telegram-bot-api-secret-token` terhadap `webhook_secret` (DB) atau `TELEGRAM_WEBHOOK_SECRET` (env).

3. Internal notify secret
- Endpoint `/api/telegram/notify-email` menerima caller non-login hanya jika secret cocok (`x-mailflare-telegram-secret`).

4. Dedup update webhook
- `update_id` disimpan ke tabel `telegram_webhook_updates` dengan `ON CONFLICT DO NOTHING`.

## 9) Sinkronisasi Status Webhook

Panel webhook pada worker settings menggunakan dua sumber:

- `live` -> dari Telegram API `getWebhookInfo` (jika token valid dan request berhasil)
- `settings` -> fallback dari nilai yang tersimpan di `worker_settings`

Jika bot/webhook belum dikonfigurasi, panel menampilkan nilai kosong dan badge `Disconnected` (bukan data dummy).

Jika Telegram API mengembalikan error terakhir webhook, panel menampilkan:

- `lastErrorMessage`
- `lastErrorAt`

## 10) Integrasi UI Access Code

Halaman `/auth/access-code` sekarang sudah terhubung ke backend:

- submit form -> `POST /api/auth/access-code`
- jika sukses -> redirect `/dashboard`
- jika gagal -> tampilkan error message

## 11) Skenario Uji Cepat

1. Set konfigurasi bot (`bot_token`, `allowed_ids`, optional `webhook_secret`).
2. Set webhook Telegram ke `/api/telegram/webhook`.
3. Kirim command di chat Telegram:
- `listuser desc`
- `adduser demo123`
- `inbox demo123`
- `access`
4. Buka `/auth/access-code`, masukkan kode dari Telegram, pastikan login berhasil.
5. Buat user dari dashboard, cek notifikasi kredensial masuk ke Telegram.
6. Uji endpoint notify email:

```bash
curl -X POST "https://<PUBLIC_URL>/api/telegram/notify-email" \
  -H "Content-Type: application/json" \
  -H "x-mailflare-telegram-secret: <TELEGRAM_INTERNAL_SECRET>" \
  -d '{
    "emailId":"eml_test_001",
    "sender":"alice@example.com",
    "recipient":"demo123@mailflare.local",
    "subject":"Test inbound",
    "snippet":"Ini adalah snippet uji notifikasi"
  }'
```

7. Uji tombol **Test Connection** di halaman worker settings.
8. Pastikan Anda menerima 2 pesan di Telegram:
- pesan test koneksi bot
- pesan test notify-email (format email masuk + inline actions)
9. Pastikan badge webhook menunjukkan `Connected (live)` saat webhook valid.

## 12) Troubleshooting

### Command tidak direspon

Periksa:

- `allowed_ids` berisi Telegram user id yang benar
- `bot_token` valid
- webhook aktif dan tidak error (`getWebhookInfo`)

### Webhook 401 Unauthorized webhook secret

Periksa kesesuaian:

- header Telegram `x-telegram-bot-api-secret-token`
- nilai `webhook_secret` di DB atau `TELEGRAM_WEBHOOK_SECRET` di env

### Notifikasi inbound tidak terkirim

Periksa:

- `forward_inbound` bernilai true (`1`)
- target chat id terisi (`allowed_ids`/`default_chat_id`/`test_chat_id`)
- endpoint `/api/telegram/notify-email` dipanggil dengan payload valid

### Email inbound ter-drop padahal catch-all aktif

Periksa:

- recipient email benar-benar ada di tabel `users.email`
- format recipient sesuai domain user (`username@<mail-domain>`)
- log worker untuk pesan reject `Unknown recipient`

### Access code invalid/expired

Periksa:

- format kode benar `MF-XXXX-XXXX-XXXX`
- belum melewati TTL 10 menit
- kode belum pernah dipakai

### Test Connection gagal

Periksa:

- `bot_token` di DB atau env `TELEGRAM_BOT_TOKEN` sudah valid
- salah satu target chat tersedia dari DB (`test_chat_id`, `default_chat_id`, atau `allowed_ids`)
- bot sudah pernah memulai chat dengan user target (Telegram restriction)

## 13) Catatan Operasional

- Endpoint `notify-email` adalah entry point notifikasi inbound.
- Untuk skenario Cloudflare Email Routing, handler `email()` di Worker akan mem-forward payload ke endpoint tersebut secara otomatis (butuh `MAILFLARE_NOTIFY_URL` + `TELEGRAM_INTERNAL_SECRET`).
- Handler `email()` memvalidasi recipient ke DB terlebih dulu; recipient tidak dikenal akan ditolak.
- Jika ingin memaksa keamanan lebih ketat, isi `webhook_secret` dan `TELEGRAM_INTERNAL_SECRET` wajib di environment production.
- Gunakan HTTPS public URL untuk webhook Telegram production.
