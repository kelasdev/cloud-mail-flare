# Deploy Production MailFlare (Cloudflare Worker + D1 + Email Routing)

Panduan ini adalah acuan deploy production untuk project ini.
Ikuti urutan dari atas ke bawah agar tidak ada konfigurasi yang terlewat.

## 1) Arsitektur dan Domain

Project berjalan sebagai satu Worker (`mailflare-web`) yang menangani:
- UI SvelteKit
- API (`/api/*`)
- Integrasi D1
- Event Email Routing (`email()` handler)

Pemisahan domain pada production:
- Domain UI/API: `https://<app-domain>`
- Domain email user: `username@<mail-domain>`

Catatan:
- `<app-domain>` adalah URL aplikasi, bukan format alamat email user.
- Format email user ditentukan oleh `MAILFLARE_USER_DOMAIN` / `worker_settings.user_email_domain`.

## 2) Prasyarat

- Node.js 20+
- `pnpm` terpasang
- Akun Cloudflare dengan akses Workers, D1, dan Email Routing
- Domain sudah ada di akun Cloudflare

## 3) Nilai yang Harus Disiapkan

Siapkan nilai berikut sebelum deploy:

- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID` (jika sudah ada; jika belum, akan dibuat)
- `APP_DOMAIN` (contoh: `mail.example.com`)
- `MAIL_DOMAIN` (contoh: `example.com`)
- `SETUP_TOKEN` (untuk bootstrap admin pertama)
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TELEGRAM_BOT_TOKEN` (opsional, jika pakai Telegram)
- `TELEGRAM_WEBHOOK_SECRET` (opsional, direkomendasikan)
- `TELEGRAM_INTERNAL_SECRET` (wajib jika pakai Email Routing -> Telegram notify)

## 4) Install dan Login Wrangler

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

## 5) Konfigurasi `wrangler.toml`

Gunakan contoh ini sebagai baseline:

```toml
name = "<nama-worker-anda>"
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
MAILFLARE_USER_DOMAIN = "<your-root-email-domain>"
MAILFLARE_NOTIFY_URL = "https://<app-domain>"

[[d1_databases]]
binding = "DB"
database_name = "<nama-database-d1-anda>"
database_id = "replace-with-your-d1-database-id"
```

Penjelasan field penting:
- `name`: nama Worker di Cloudflare — harus sama persis dengan nama yang dibuat di dashboard/wrangler.
- `[[routes]]`: target custom domain untuk UI/API.
- `MAILFLARE_USER_DOMAIN`: domain email user (`username@domain`).
- `MAILFLARE_NOTIFY_URL`: base URL aplikasi untuk callback internal notify email.
- `binding = "DB"`: wajib tetap `DB` karena dipakai backend.
- `database_name`: harus sama persis dengan nama D1 yang dibuat di Langkah 6.

## 6) Buat D1 (Jika Belum Ada) dan Apply Schema

Jika DB belum ada:

```bash
pnpm exec wrangler d1 create mailflarecloud-db
```

Lalu update `database_id` di `wrangler.toml`, kemudian apply schema:

```bash
pnpm exec wrangler d1 execute mailflarecloud-db --remote --file ./schema.sql
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
```

> **Catatan:** `TELEGRAM_ALLOWED_IDS` **tidak perlu** di-set sebagai env secret production. Whitelist Allowed IDs dikelola dari UI halaman `/worker/settings` setelah login (disimpan di DB). Env `TELEGRAM_ALLOWED_IDS` hanya berfungsi sebagai fallback awal jika key `allowed_ids` belum pernah disimpan ke DB.

Generate secret acak kuat (opsional):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 8) Validasi Sebelum Deploy

```bash
pnpm check
```

Jika gagal, perbaiki error dulu sebelum deploy.

## 9) Deploy Worker

```bash
pnpm run deploy
```

Expected output penting:
- Tidak ada error build
- Worker ter-upload sukses
- Trigger menampilkan custom domain (contoh: `<app-domain> (custom domain)`)

> **Catatan:** Proses `pnpm run deploy` menjalankan 3 tahap: `pnpm build` (SvelteKit) → `postbuild-add-email-handler.mjs` (inject handler `email()` ke worker output) → `wrangler deploy`. Handler `email()` inilah yang menerima email dari Cloudflare Email Routing.

Jika muncul `No deploy targets`:
- pastikan `[[routes]]` sudah benar dan domain sudah aktif di Cloudflare
- `workers_dev` harus tetap `false` (jangan diubah ke `true` di production, karena itu untuk subdomain `*.workers.dev` bukan custom domain).

## 10) Bootstrap Admin Pertama

Saat DB masih kosong:
- buka `https://<app-domain>/auth/login`
- Selesaikan CAPTCHA Cloudflare Turnstile yang tampil di form login
- isi **Email** dan **Password** yang diinginkan untuk akun admin
- isi field **Setup Token (First Login Only)** dengan nilai `SETUP_TOKEN` yang sudah di-set sebagai secret

Jika token tidak cocok, bootstrap akan ditolak dengan error `Invalid setup token`.

> Setup Token hanya diperlukan sekali saat tabel `users` masih kosong. Login berikutnya tidak memerlukan field ini.

## 11) Konfigurasi Worker Settings (UI)

Setelah login sebagai admin:
- buka `/worker/settings`
- isi bagian Telegram:
  - **Bot Token** (jika belum di-set via env)
  - **Webhook Secret** (opsional)
  - **Allowed IDs** — Telegram User ID yang boleh kirim command (pisah koma, contoh: `123456789,987654321`)
  - **Default Chat ID** / **Test Chat ID**
  - **Target Mode** — pilih `All Allowed IDs`, `Default`, atau `Test`
  - **Forward inbound** — aktifkan agar email masuk diteruskan ke Telegram
- isi **User Email Domain** jika ingin domain inbox berbeda dari `MAILFLARE_USER_DOMAIN`

## 12) Setup Telegram Webhook (Jika Dipakai)

**Opsi A — via halaman Worker Settings (direkomendasikan):**
- Buka `/worker/settings`
- Isi field **Webhook URL** dengan `https://<app-domain>/api/telegram/webhook`
- Klik tombol **Connect Webhook** — sistem akan memanggil `POST /api/worker-settings/connect-webhook` secara otomatis

**Opsi B — via CLI:**

```bash
pnpm telegram:webhook:set -- \
  --token "<BOT_TOKEN>" \
  --url "https://<app-domain>/api/telegram/webhook" \
  --secret "<WEBHOOK_SECRET>" \
  --allowed-updates "message,callback_query"
```

Verifikasi:

```bash
pnpm telegram:webhook:info -- --token "<BOT_TOKEN>"
```

Tambahkan command menu bot di Telegram (opsional tapi direkomendasikan agar muncul autocomplete di chat):

```bash
pnpm telegram:commands -- --token "<BOT_TOKEN>"
```

## 13) Setup Email Routing ke Worker

Tujuan:
- menerima email asli (`username@<mail-domain>`)
- menjalankan handler `email()` di Worker untuk persist email ke D1 dan forward notifikasi ke Telegram

Langkah:
1. Cloudflare Dashboard → Email → Email Routing.
2. Pastikan domain email sudah aktif dan terverifikasi di Email Routing.
3. Tambah inbound rule:
   - Rekomendasi: **Catch-all** `*@<mail-domain>` agar semua username dinamis bisa menerima email.
4. Destination: pilih **Send to a Worker** → pilih nama worker Anda (sesuai field `name` di `wrangler.toml`).

Behavior runtime saat ini:
- Worker memvalidasi recipient ke tabel `users`. Lookup dilakukan secara exact match email, lalu fallback ke local-part (sebelum `@`), termasuk strip plus-addressing (contoh `user+tag@domain` → cocok ke user `user`).
- Recipient yang tidak ditemukan di DB akan **di-reject** (`setReject('Unknown recipient')`).
- Recipient valid: email dipersist ke tabel `emails` lalu notifikasi dikirim ke Telegram via `/api/telegram/notify-email`.

Catch-all aman dipakai karena validasi recipient dilakukan di backend sebelum memproses apapun.

## 14) Smoke Test Production

Ganti `<APP_URL>` dengan domain UI kamu (`https://<app-domain>`):

```bash
# Endpoint publik (tidak perlu login)
curl <APP_URL>/api/health

# Endpoint yang butuh sesi login (akan 401 tanpa cookie)
curl <APP_URL>/api/dashboard
curl <APP_URL>/api/users
curl <APP_URL>/api/worker-settings
```

Checklist:
- [ ] `/api/health` mengembalikan `{ ok: true }` atau status sukses
- [ ] `/api/dashboard`, `/api/users`, `/api/worker-settings` mengembalikan `401` (bukan `500`) — artinya DB terhubung dan auth berjalan
- [ ] Login via browser berhasil membuat session
- [ ] Tombol **Test Connection** di `/worker/settings` berhasil kirim pesan ke Telegram
- [ ] Email ke recipient yang terdaftar di DB diterima dan muncul di inbox
- [ ] Email ke recipient tidak dikenal di-drop (tidak muncul di DB)

## 15) Troubleshooting Cepat

`wrangler whoami` gagal:
- login ulang `pnpm exec wrangler login`

`database_id` salah / D1 tidak terbaca:
- cek `wrangler.toml` dan binding `DB`
- pastikan schema sudah di-apply ke remote

Deploy sukses tapi tidak ada domain aktif:
- cek `[[routes]]`
- pastikan custom domain ada di zone yang sama

Email Routing tidak muncul ke Worker:
- deploy ulang terbaru (`pnpm run deploy`)
- pastikan script `postbuild-add-email-handler.mjs` sukses (tidak ada error saat build)
- cek di Cloudflare Dashboard → Email Routing bahwa destination sudah dipilih **Send to a Worker** dan nama worker sudah benar (sesuai `wrangler.toml`)

Email inbound drop terus:
- cek recipient ada di tabel `users.email` (termasuk format exact: `username@domain`)
- cek tidak ada plus-addressing yang hasilkan dua username identik (sistem hanya meneruskan jika hasil lookup unik)
- cek `MAILFLARE_USER_DOMAIN` / `user_email_domain` di worker settings sudah sesuai domain email aktif

Telegram notify tidak terkirim:
- cek `TELEGRAM_INTERNAL_SECRET` sudah di-set (wajib diisi agar email handler bisa memanggil endpoint notify)
- cek `MAILFLARE_NOTIFY_URL` sudah benar dan bisa diakses dari Worker
- cek setting chat target (`Allowed IDs`, `Default Chat ID`) di `/worker/settings`
- cek `forward_inbound` di worker settings bernilai `true`/`1`

Login gagal padahal credentials benar:
- Pastikan CAPTCHA Cloudflare Turnstile selesai — endpoint login menolak request tanpa `turnstileToken` yang valid
- Cek `TURNSTILE_SITE_KEY` dan `TURNSTILE_SECRET_KEY` sudah di-set sebagai secret Worker
