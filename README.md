# 📬 Cloud Mail Flare

> Aplikasi web email pribadi yang berjalan 100% di atas infrastruktur Cloudflare — **gratis**, **cepat**, dan **aman**.

---

## 🧐 Apa itu Cloud Mail Flare?

**Cloud Mail Flare** adalah aplikasi manajemen email berbasis web yang Anda host sendiri (self-hosted) menggunakan layanan **Cloudflare** (gratis). Anda bisa membuat kotak masuk (inbox) email dengan domain sendiri, mengelola pengguna, dan menerima notifikasi email langsung ke **Telegram**.

Seluruh aplikasi berjalan sebagai satu **Cloudflare Worker** — tidak perlu server VPS, tidak perlu bayar hosting mahal.

---

## ✨ Fitur Utama

| Fitur                  | Keterangan                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| 📥 Inbox Email         | Menerima dan membaca email masuk via Cloudflare Email Routing        |
| 👤 Manajemen Pengguna  | Admin bisa membuat & menghapus akun pengguna                         |
| 🔐 Login Aman          | Session berbasis cookie + CAPTCHA Cloudflare Turnstile               |
| 🤖 Notifikasi Telegram | Email masuk langsung dikirim ke chat Telegram Anda                   |
| 🔑 Public API Key v1 | Akses API machine-to-machine (`create_user`, `list_user`, `user_mailbox`, `read_email`) |
| 🛡️ Keamanan Password | Password disimpan dalam format hash PBKDF2-SHA256 (bukan teks biasa) |
| 🗄️ Database Gratis   | Menggunakan Cloudflare D1 (SQLite serverless)                        |
| 🌐 Multi-User          | Mendukung role Admin dan Member dengan hak akses berbeda             |
| ⚙️ Pengaturan Worker | Admin bisa mengubah konfigurasi langsung dari UI                     |

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

## 🔑 Peran Pengguna (Roles)

| Role             | Akses                                                              |
| ---------------- | ------------------------------------------------------------------ |
| **Admin**  | Semua halaman: Dashboard, Users, Worker Settings, Inbox semua user |
| **Member** | Hanya inbox milik sendiri (`/me/inbox`)                          |

---

## 📡 Daftar API Endpoint

| Method     | Path                     | Keterangan                        |
| ---------- | ------------------------ | --------------------------------- |
| `GET`    | `/api/health`          | Cek status aplikasi               |
| `POST`   | `/api/auth/login`      | Login pengguna                    |
| `GET`    | `/api/auth/logout`     | Logout pengguna                   |
| `GET`    | `/api/me`              | Info akun yang sedang login       |
| `GET`    | `/api/me/inbox`        | Inbox milik sendiri               |
| `GET`    | `/api/me/emails/:id`   | Detail email milik sendiri        |
| `GET`    | `/api/users`           | Daftar semua pengguna (Admin)     |
| `POST`   | `/api/users`           | Buat pengguna baru (Admin)        |
| `GET`    | `/api/users/:id`       | Detail pengguna (Admin)           |
| `PATCH`  | `/api/users/:id`       | Update pengguna (Admin)           |
| `DELETE` | `/api/users/:id`       | Hapus pengguna (Admin)            |
| `GET`    | `/api/users/:id/inbox` | Inbox pengguna tertentu (Admin)   |
| `GET`    | `/api/dashboard`       | Data dashboard (Admin)            |
| `GET`    | `/api/worker-settings` | Baca konfigurasi worker (Admin)   |
| `PATCH`  | `/api/worker-settings` | Update konfigurasi worker (Admin) |
| `GET`    | `/api/worker-settings/api-key` | Status API key aktif (Admin) |
| `POST`   | `/api/worker-settings/api-key/generate` | Generate API key baru (Admin) |
| `POST`   | `/api/worker-settings/api-key/regenerate` | Rotate/regenerate API key (Admin) |
| `POST`   | `/api/public/v1/create_user` | Public API: create user (API key) |
| `GET`    | `/api/public/v1/list_user` | Public API: list user (API key) |
| `GET`    | `/api/public/v1/user_mailbox` | Public API: inbox by username (API key) |
| `GET`    | `/api/public/v1/read_email` | Public API: read email rendered text (API key) |
| `GET`    | `/api/public/v1/read_emai` | Alias kompatibilitas untuk `read_email` |

---

## 📜 NPM Scripts — Perintah yang Tersedia

| Perintah                         | Fungsi                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                     | Jalankan Vite dev server biasa (tanpa D1)                      |
| `pnpm cf:dev`                  | Jalankan Worker dev mode**dengan D1** (direkomendasikan) |
| `pnpm check`                   | Cek error TypeScript / Svelte                                  |
| `pnpm build`                   | Build aplikasi untuk production                                |
| `pnpm run deploy`              | Build + upload ke Cloudflare                                   |
| `pnpm smoke:api-key:v1`        | Smoke test otomatis API key + public API v1 (lokal)           |
| `pnpm telegram:webhook:set`    | Daftarkan webhook Telegram                                     |
| `pnpm telegram:webhook:delete` | Hapus webhook Telegram                                         |
| `pnpm telegram:webhook:info`   | Cek info webhook Telegram                                      |

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

| Dokumen                                                              | Isi                                      |
| -------------------------------------------------------------------- | ---------------------------------------- |
| [deploy-fullstack-cloudflare.md](./docs/deploy-fullstack-cloudflare.md) | Panduan deployment lengkap ke production |
| [integrasi-telegram-bot.md](./docs/integrasi-telegram-bot.md)           | Setup bot Telegram secara detail         |
| [member-inbox-only.md](./docs/member-inbox-only.md)                     | Penjelasan mode Member / inbox-only      |
| [api-key-public-api.md](./docs/api-key-public-api.md)                   | Spesifikasi + UAT terpadu API key & public API v1 |

---

## ⚠️ Catatan Penting

- File `.dev.vars` **jangan pernah di-push ke GitHub** (sudah ada di `.gitignore`).
- Saat build di **Windows**, project otomatis menjalankan script `prebuild` untuk membersihkan cache agar tidak error.
- Hapus pengguna hanya bisa dilakukan jika tidak ada data email atau sesi login yang masih terhubung.
- `schema.sql` adalah sumber kebenaran (source of truth) untuk struktur database — jangan diubah sembarangan.
