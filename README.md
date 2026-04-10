# 📬 Cloud Mail Flare

> Aplikasi web email pribadi yang berjalan 100% di atas infrastruktur Cloudflare — **gratis**, **cepat**, dan **aman**.

---

## 🧐 Apa itu Cloud Mail Flare?

**Cloud Mail Flare** adalah aplikasi manajemen email berbasis web yang Anda host sendiri (self-hosted) menggunakan layanan **Cloudflare** (gratis). Anda bisa membuat kotak masuk (inbox) email dengan domain sendiri, mengelola pengguna, dan menerima notifikasi email langsung ke **Telegram**.

Seluruh aplikasi berjalan sebagai satu **Cloudflare Worker** — tidak perlu server VPS, tidak perlu bayar hosting mahal.

---

## ✨ Fitur Utama

| Fitur | Keterangan |
|---|---|
| 📥 Inbox Email | Menerima dan membaca email masuk via Cloudflare Email Routing |
| 👤 Manajemen Pengguna | Admin bisa membuat & menghapus akun pengguna |
| 🔐 Login Aman | Session berbasis cookie + CAPTCHA Cloudflare Turnstile |
| 🤖 Notifikasi Telegram | Email masuk langsung dikirim ke chat Telegram Anda |
| 🛡️ Keamanan Password | Password disimpan dalam format hash PBKDF2-SHA256 (bukan teks biasa) |
| 🗄️ Database Gratis | Menggunakan Cloudflare D1 (SQLite serverless) |
| 🌐 Multi-User | Mendukung role Admin dan Member dengan hak akses berbeda |
| ⚙️ Pengaturan Worker | Admin bisa mengubah konfigurasi langsung dari UI |

---

## 🏗️ Teknologi yang Digunakan

Tidak perlu memahami semuanya sekarang, tapi ini adalah teknologi di balik layar:

- **[SvelteKit](https://kit.svelte.dev/)** — Framework frontend + backend (seperti Next.js, tapi lebih ringan)
- **[Cloudflare Workers](https://workers.cloudflare.com/)** — Tempat aplikasi dijalankan (serverless)
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** — Database SQL gratis dari Cloudflare
- **[Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)** — Penerusan email masuk ke Worker
- **[Wrangler](https://developers.cloudflare.com/workers/wrangler/)** — CLI resmi Cloudflare untuk development & deploy
- **[pnpm](https://pnpm.io/)** — Package manager Node.js (lebih cepat dari npm)

---

## 📋 Sebelum Mulai — Yang Perlu Disiapkan

Pastikan hal-hal berikut sudah tersedia di komputer Anda:

### 1. Software yang Harus Diinstall

- ✅ **Node.js versi 20 ke atas** → [Download di nodejs.org](https://nodejs.org/)
- ✅ **pnpm** (package manager) → Install dengan perintah:
  ```bash
  npm install -g pnpm
  ```
- ✅ **Git** (opsional, untuk clone repository) → [Download di git-scm.com](https://git-scm.com/)

### 2. Akun yang Diperlukan

- ✅ **Akun Cloudflare** (gratis) → [Daftar di cloudflare.com](https://cloudflare.com/)
- ✅ **Domain yang sudah terdaftar di Cloudflare** (diperlukan untuk Email Routing)

---

## 🚀 Panduan Setup Dari Awal (Langkah demi Langkah)

### Langkah 1 — Clone / Download Project

```bash
git clone https://github.com/username/cloud-mail-flare.git
cd cloud-mail-flare
```

> Atau download ZIP dari GitHub lalu ekstrak dan buka foldernya di terminal.

---

### Langkah 2 — Install Semua Dependency

Jalankan perintah ini di dalam folder project:

```bash
pnpm install
```

> Ini akan mengunduh semua library yang dibutuhkan. Tunggu hingga selesai.

---

### Langkah 3 — Login ke Cloudflare via Wrangler

Wrangler adalah alat CLI resmi Cloudflare. Login agar Wrangler bisa berkomunikasi dengan akun Cloudflare Anda:

```bash
pnpm exec wrangler login
```

> Browser akan terbuka dan meminta Anda login ke Cloudflare. Klik **Authorize** jika diminta.

---

### Langkah 4 — Buat Database D1 di Cloudflare

```bash
pnpm exec wrangler d1 create mailflarecloud-db
```

Perintah ini akan menampilkan output seperti:

```
✅ Successfully created DB 'mailflarecloud-db'
...
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Catat `database_id` tersebut**, akan dipakai di langkah berikutnya.

---

### Langkah 5 — Konfigurasi `wrangler.toml`

Salin file contoh konfigurasi:

```bash
# Windows (Command Prompt / PowerShell)
copy wrangler.toml.example wrangler.toml

# Mac / Linux
cp wrangler.toml.example wrangler.toml
```

Buka file `wrangler.toml` dengan teks editor dan isi bagian yang ditandai `<...>`:

```toml
name = "mailflare-web"
...

[[routes]]
pattern = "<app-domain>"       # ← Ganti dengan subdomain Anda, contoh: mail.example.com
custom_domain = true

[vars]
MAILFLARE_USER_DOMAIN = "<your-root-email-domain>"   # ← Domain inbox email, contoh: example.com
MAILFLARE_NOTIFY_URL = "https://<app-domain>"        # ← URL aplikasi, contoh: https://mail.example.com

[[d1_databases]]
binding = "DB"
database_name = "mailflarecloud-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← Hasil dari Langkah 4
```

---

### Langkah 6 — Setup Environment Variables Lokal

Salin file contoh environment:

```bash
# Windows
copy .dev.vars.example .dev.vars

# Mac / Linux
cp .dev.vars.example .dev.vars
```

Buka `.dev.vars` dan ubah nilai `SETUP_TOKEN` menjadi password rahasia pilihan Anda:

```env
# Wajib diisi — ini adalah "kunci" untuk membuat akun admin pertama
SETUP_TOKEN="Password_Rahasia_Anda_Disini!"

# CAPTCHA (nilai di bawah ini sudah siap untuk testing lokal, jangan diubah dulu)
TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"

# Telegram (opsional, bisa diisi nanti)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_INTERNAL_SECRET=""
```

> ⚠️ **Jangan pernah upload file `.dev.vars` ke GitHub!** File ini sudah tercantum di `.gitignore`.

---

### Langkah 7 — Inisialisasi Database Lokal

Jalankan schema SQL ke database D1 lokal:

```bash
pnpm exec wrangler d1 execute mailflarecloud-db --local --file ./schema.sql
```

> Perintah ini membuat semua tabel yang dibutuhkan aplikasi di database lokal.

---

### Langkah 8 — Jalankan Aplikasi Secara Lokal

```bash
pnpm cf:dev
```

Tunggu hingga muncul pesan seperti:

```
✅ Starting local server...
http://127.0.0.1:8787
```

Buka browser dan akses **http://127.0.0.1:8787** — aplikasi sudah berjalan! 🎉

---

### Langkah 9 — Buat Akun Admin Pertama

1. Buka **http://127.0.0.1:8787** di browser
2. Di halaman login, isi:
   - **Email**: alamat email yang Anda inginkan (contoh: `admin@example.com`)
   - **Password**: password pilihan Anda
   - **Setup Token**: isi dengan nilai `SETUP_TOKEN` yang ada di file `.dev.vars`
3. Klik **Login** — akun admin pertama akan otomatis dibuat!

> 💡 Setup Token hanya diperlukan sekali, saat membuat akun pertama. Setelah itu, login biasa tidak memerlukan field ini.

---

## 🌍 Deploy ke Production (Cloudflare)

Setelah berhasil di lokal, Anda bisa deploy ke Cloudflare agar bisa diakses dari internet.

### Langkah Singkat

**1. Set secrets di Cloudflare** (jangan gunakan `.dev.vars` untuk production):

```bash
pnpm exec wrangler secret put SETUP_TOKEN
pnpm exec wrangler secret put TURNSTILE_SITE_KEY
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
```

**2. Inisialisasi database production:**

```bash
pnpm exec wrangler d1 execute mailflarecloud-db --remote --file ./schema.sql
```

**3. Deploy ke Cloudflare:**

```bash
pnpm run deploy
```

**4. Setup Email Routing di Cloudflare Dashboard:**
- Masuk ke **Cloudflare Dashboard → Email → Email Routing**
- Buat rule: **Catch-all** → **Worker** → pilih `mailflare-web`

> 📖 Untuk panduan lengkap deployment beserta konfigurasi domain dan troubleshooting, baca:
> **[docs/deploy-fullstack-cloudflare.md](./docs/deploy-fullstack-cloudflare.md)**

---

## 🔑 Peran Pengguna (Roles)

| Role | Akses |
|---|---|
| **Admin** | Semua halaman: Dashboard, Users, Worker Settings, Inbox semua user |
| **Member** | Hanya inbox milik sendiri (`/me/inbox`) |

---

## 📡 Daftar API Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Cek status aplikasi |
| `POST` | `/api/auth/login` | Login pengguna |
| `GET` | `/api/auth/logout` | Logout pengguna |
| `GET` | `/api/me` | Info akun yang sedang login |
| `GET` | `/api/me/inbox` | Inbox milik sendiri |
| `GET` | `/api/me/emails/:id` | Detail email milik sendiri |
| `GET` | `/api/users` | Daftar semua pengguna (Admin) |
| `POST` | `/api/users` | Buat pengguna baru (Admin) |
| `GET` | `/api/users/:id` | Detail pengguna (Admin) |
| `PATCH` | `/api/users/:id` | Update pengguna (Admin) |
| `DELETE` | `/api/users/:id` | Hapus pengguna (Admin) |
| `GET` | `/api/users/:id/inbox` | Inbox pengguna tertentu (Admin) |
| `GET` | `/api/dashboard` | Data dashboard (Admin) |
| `GET` | `/api/worker-settings` | Baca konfigurasi worker (Admin) |
| `PATCH` | `/api/worker-settings` | Update konfigurasi worker (Admin) |

---

## 🤖 Integrasi Notifikasi Telegram (Opsional)

Fitur ini memungkinkan Anda menerima notifikasi di Telegram setiap ada email masuk.

### Cara Setup

1. **Buat bot Telegram** di [@BotFather](https://t.me/BotFather) dan catat token bot.

2. **Isi environment variables** di `.dev.vars` (lokal) atau via `wrangler secret` (production):
   ```env
   TELEGRAM_BOT_TOKEN="token_dari_botfather"
   TELEGRAM_WEBHOOK_SECRET="string_acak_32_karakter"
   TELEGRAM_INTERNAL_SECRET="string_acak_lain_32_karakter"

   # Opsional: whitelist Telegram User ID (fallback awal sebelum diatur dari UI)
   TELEGRAM_ALLOWED_IDS="123456789,987654321"
   ```

3. **Atur Allowed IDs (Whitelist User Telegram)**

   `Allowed IDs` adalah daftar **Telegram User ID** yang diizinkan mengirim command ke bot. Hanya ID yang terdaftar yang bisa menggunakan command seperti `adduser`, `listuser`, `inbox`, dll.

   **Cara mendapatkan Telegram User ID Anda:**
   - Buka Telegram, cari bot [@userinfobot](https://t.me/userinfobot)
   - Kirim pesan ke bot tersebut — ia akan membalas dengan User ID Anda (berupa angka, contoh: `123456789`)

   **Dua cara mengatur Allowed IDs:**

   | Cara | Keterangan |
   |---|---|
   | **Dari UI (direkomendasikan)** | Login sebagai admin → buka **/worker/settings** → isi field **Allowed IDs (DB)** dengan ID yang dipisah koma |
   | **Dari env var (fallback awal)** | Isi `TELEGRAM_ALLOWED_IDS` di `.dev.vars` atau `wrangler secret`. Ini hanya dipakai jika DB belum pernah menyimpan nilai `allowed_ids` |

   > ⚠️ **Penting:** Setelah Anda menyimpan `Allowed IDs` dari halaman UI (meski dikosongkan), sistem akan selalu menggunakan nilai dari **database**, bukan dari env var. Jadi pastikan nilainya benar sebelum disimpan.

4. **Setelah deploy**, daftarkan webhook bot:
   ```bash
   pnpm telegram:webhook:set -- \
     --token "<BOT_TOKEN>" \
     --url "<WORKER_URL>/api/telegram/webhook" \
     --secret "<WEBHOOK_SECRET>" \
     --allowed-updates "message,callback_query"
   ```

4. Di halaman **Worker Settings** aplikasi, isi **Chat ID** Telegram tujuan notifikasi.

> 📖 Panduan lengkap tersedia di: **[docs/integrasi-telegram-bot.md](./docs/integrasi-telegram-bot.md)**

> ⚠️ Untuk testing lokal dengan Telegram, Anda perlu alat seperti [ngrok](https://ngrok.com/) karena Telegram harus bisa mengakses URL webhook Anda dari internet.

---

## 📜 NPM Scripts — Perintah yang Tersedia

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Jalankan Vite dev server biasa (tanpa D1) |
| `pnpm cf:dev` | Jalankan Worker dev mode **dengan D1** (direkomendasikan) |
| `pnpm check` | Cek error TypeScript / Svelte |
| `pnpm build` | Build aplikasi untuk production |
| `pnpm run deploy` | Build + upload ke Cloudflare |
| `pnpm telegram:webhook:set` | Daftarkan webhook Telegram |
| `pnpm telegram:webhook:delete` | Hapus webhook Telegram |
| `pnpm telegram:webhook:info` | Cek info webhook Telegram |

---

## 🗂️ Struktur Folder Project

```
cloud-mail-flare/
├── src/
│   ├── lib/
│   │   ├── components/       # Komponen UI (Atomic Design)
│   │   │   ├── atoms/        # Elemen dasar (tombol, input, dll)
│   │   │   ├── molecules/    # Gabungan atom (form, kartu, dll)
│   │   │   └── organisms/    # Bagian halaman (navbar, sidebar)
│   │   ├── server/
│   │   │   ├── db.ts         # Akses database terpusat
│   │   │   └── services/     # Logika bisnis backend
│   │   └── types/            # Definisi tipe TypeScript
│   └── routes/
│       ├── api/              # Semua endpoint API
│       ├── auth/             # Halaman login/logout
│       ├── dashboard/        # Halaman admin dashboard
│       ├── me/               # Halaman inbox member
│       ├── users/            # Halaman manajemen user (admin)
│       └── worker/           # Halaman worker settings (admin)
├── docs/                     # Dokumentasi tambahan
├── scripts/                  # Script build & Telegram
├── schema.sql                # Schema database (source of truth)
├── wrangler.toml             # Konfigurasi Cloudflare Worker
├── .dev.vars                 # Environment variables lokal (jangan di-commit!)
└── package.json
```

---

## ❓ Pertanyaan Umum (FAQ)

**Q: Apakah ini benar-benar gratis?**
> Ya! Cloudflare Workers, D1, dan Email Routing memiliki tier gratis yang lebih dari cukup untuk penggunaan pribadi.

**Q: Apakah saya perlu VPS atau server?**
> Tidak. Semua berjalan sebagai Cloudflare Worker — tidak ada server yang perlu dikelola.

**Q: Bagaimana jika saya lupa Setup Token?**
> Lihat kembali nilai `SETUP_TOKEN` di file `.dev.vars` (lokal) atau secrets Cloudflare (production).

**Q: Bisa pakai lebih dari satu domain email?**
> Saat ini sistem menggunakan satu domain email utama. Anda bisa mengaturnya di **Worker Settings → user_email_domain**.

**Q: Apa bedanya `pnpm dev` dan `pnpm cf:dev`?**
> `pnpm dev` menjalankan Vite biasa (cepat tapi tidak bisa akses database D1). `pnpm cf:dev` mensimulasikan lingkungan Cloudflare secara penuh termasuk D1 — gunakan ini untuk development sehari-hari.

---

## 📚 Dokumentasi Tambahan

| Dokumen | Isi |
|---|---|
| [deploy-fullstack-cloudflare.md](./docs/deploy-fullstack-cloudflare.md) | Panduan deployment lengkap ke production |
| [integrasi-telegram-bot.md](./docs/integrasi-telegram-bot.md) | Setup bot Telegram secara detail |
| [member-inbox-only.md](./docs/member-inbox-only.md) | Penjelasan mode Member / inbox-only |
| [SECURITY_AUDIT_CHECKLIST.md](./docs/SECURITY_AUDIT_CHECKLIST.md) | Checklist keamanan aplikasi |

---

## ⚠️ Catatan Penting

- File `.dev.vars` **jangan pernah di-push ke GitHub** (sudah ada di `.gitignore`).
- Saat build di **Windows**, project otomatis menjalankan script `prebuild` untuk membersihkan cache agar tidak error.
- Hapus pengguna hanya bisa dilakukan jika tidak ada data email atau sesi login yang masih terhubung.
- `schema.sql` adalah sumber kebenaran (source of truth) untuk struktur database — jangan diubah sembarangan.
