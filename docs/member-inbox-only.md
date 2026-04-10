# Dokumentasi Mode Inbox-Only Member

Dokumen ini menjelaskan pembatasan akses akun `member` agar hanya bisa membuka inbox dan detail email miliknya sendiri.

## Tujuan

- Mencegah akun member merender atau mengakses halaman admin.
- Menyediakan endpoint API khusus profil sendiri (`/api/me/*`) agar policy lebih jelas.
- Menjaga UX member sederhana: hanya inbox dan baca email.

## Alur Halaman

- Setelah login:
  - role `owner` -> redirect ke `/dashboard`
  - role `member` -> redirect ke `/me/inbox`
- Halaman member:
  - `/me/inbox`
  - `/me/emails/:emailId`

## Route Guard

Guard ada di `src/hooks.server.ts`:

- Jika role `member`, path non-API yang diizinkan hanya:
  - `/me/inbox`
  - `/me/emails/*`
- Akses ke halaman admin seperti `/dashboard`, `/users`, `/worker/settings` akan diarahkan ulang ke `/me/inbox`.

## API Member

Endpoint yang boleh diakses akun `member`:

- `GET /api/me`
- `GET /api/me/inbox`
- `GET /api/me/emails/:emailId`
- `GET|POST /api/auth/logout`
- `POST /api/auth/access-code`
- `GET /api/health`

Endpoint admin (`/api/users/*`, `/api/dashboard`, `/api/worker-settings`, dll) diblokir dengan respons `403 Forbidden` untuk member.

## Implementasi Endpoint

- `src/routes/api/me/+server.ts` -> profile member aktif.
- `src/routes/api/me/inbox/+server.ts` -> 50 email inbox terbaru milik member.
- `src/routes/api/me/emails/[emailId]/+server.ts` -> detail email milik member + auto-mark as read.

## Catatan Frontend

- Halaman `/me/inbox` menggunakan komponen tabel inbox yang diarahkan ke link detail `/me/emails/:emailId`.
- Halaman `/users/:userId/*` tetap dipertahankan untuk owner monitoring user.

## Verifikasi Cepat

1. Login sebagai owner, pastikan tetap bisa buka `/dashboard`, `/users`, `/worker/settings`.
2. Login sebagai member, akses `/dashboard` -> harus redirect ke `/me/inbox`.
3. Sebagai member, panggil `/api/users` -> harus `403`.
4. Sebagai member, panggil `/api/me/inbox` -> harus `200`.
5. Buka detail email dari `/me/inbox`, pastikan URL ke `/me/emails/:emailId`.
