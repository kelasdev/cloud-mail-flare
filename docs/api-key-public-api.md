# Spesifikasi API Key dan Public API v1

Dokumen ini adalah spesifikasi implementasi fitur API key pada project `cloud-mail-flare`.
Tanggal pembaruan: 2026-04-13.

## 1. Tujuan

Menyediakan akses machine-to-machine berbasis API key untuk operasi:

1. `create_user`
2. `list_user`
3. `user_mailbox`
4. `read_email` (alias kompatibilitas: `read_emai`)

Batasan utama:

- API key hanya bisa diterbitkan dari:
  - command Telegram `apikey` / `apikey regen`
  - halaman admin `/worker/settings`
- Endpoint public API tidak boleh menerbitkan API key.

## 2. Ruang Lingkup v1

Yang termasuk:

- Single active API key global.
- Validasi API key untuk seluruh endpoint `/api/public/v1/*`.
- Endpoint public:
  - `POST /api/public/v1/create_user`
  - `GET /api/public/v1/list_user`
  - `GET /api/public/v1/user_mailbox`
  - `GET /api/public/v1/read_email`
  - `GET /api/public/v1/read_emai` (alias route, behavior sama)
- Endpoint admin issuance key:
  - `GET /api/worker-settings/api-key`
  - `POST /api/worker-settings/api-key/generate`
  - `POST /api/worker-settings/api-key/regenerate`

Yang tidak termasuk:

- Multi-key per klien/app.
- Permission per key.
- Expired key berbasis TTL.

## 3. Format dan Lifecycle API Key

Format key:

- Prefix wajib: `cmf_v1_`
- Token karakter: `A-Z`, `a-z`, `0-9`, `_`, `-`
- Panjang token: `20` sampai `120` karakter (setelah prefix)

Prinsip lifecycle:

- Plaintext key tidak disimpan di DB, hanya hash SHA-256 (`key_hash`).
- Plaintext key ditampilkan sekali saat generate/regenerate.
- Regenerate akan revoke semua key aktif lama (`revoked_at` diisi) lalu membuat key baru.

## 4. Kontrak Autentikasi API Key

Header yang diterima:

- utama: `x-api-key: <api_key>`
- alternatif: `authorization: Bearer <api_key>`

Prioritas:

- Jika keduanya ada, `x-api-key` dipakai.

Alur validasi:

1. Ambil key dari header.
2. Validasi format (`cmf_v1_` + aturan token).
3. Hash SHA-256.
4. Cari key aktif di tabel `api_keys` (`revoked_at IS NULL`).
5. Terapkan rate limit in-memory per key hash (`120 request/menit` per instance).

Jika gagal, format error:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

Kode error yang digunakan:

- `UNAUTHORIZED` (`401`)
- `BAD_REQUEST` (`400`)
- `NOT_FOUND` (`404`)
- `CONFLICT` (`409`)
- `RATE_LIMITED` (`429`)
- `INTERNAL_ERROR` (`500`)
- `SERVICE_UNAVAILABLE` (`503`)

## 5. Spesifikasi Endpoint Public API v1

Seluruh endpoint berikut wajib API key valid.

### 5.1 `POST /api/public/v1/create_user`

Request body:

```json
{
  "username": "john"
}
```

Validasi `username`:

- panjang 3-64
- hanya `a-z`, `0-9`, `.`, `_`, `-`
- tidak mengandung `@`
- harus alfanumerik di awal dan akhir

Response sukses (`201`):

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "displayName": "john",
      "role": "member",
      "status": "active"
    },
    "credentials": {
      "username": "john",
      "email": "john@example.com",
      "password": "generated-password"
    }
  }
}
```

### 5.2 `GET /api/public/v1/list_user`

Query:

- `order=asc|desc` (default `desc`)
- `limit` (default `50`, max `100`)
- `offset` (default `0`)

Response sukses (`200`):

```json
{
  "ok": true,
  "data": {
    "total": 2,
    "order": "desc",
    "limit": 50,
    "offset": 0,
    "users": [
      {
        "id": "uuid",
        "email": "admin@example.com",
        "displayName": "admin",
        "role": "owner",
        "status": "active",
        "totalEmails": 10,
        "unreadEmails": 2
      }
    ]
  }
}
```

### 5.3 `GET /api/public/v1/user_mailbox`

Query:

- `username` (required)
- `limit` (default `20`, max `100`)
- `offset` (default `0`)
- `include_archived=true|false` (default `false`)

Response sukses (`200`):

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com"
    },
    "total": 1,
    "limit": 20,
    "offset": 0,
    "includeArchived": false,
    "emails": [
      {
        "id": "email-id",
        "sender": "sender@domain.com",
        "subject": "Hello",
        "snippet": "short preview",
        "receivedAt": "2026-04-12T10:00:00.000Z",
        "isRead": false,
        "isStarred": false,
        "isArchived": false
      }
    ]
  }
}
```

### 5.4 `GET /api/public/v1/read_email`

### 5.5 `GET /api/public/v1/read_emai` (alias)

Query:

- `email_id` (required)

Response sukses (`200`):

```json
{
  "ok": true,
  "data": {
    "id": "email-id",
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com"
    },
    "sender": "sender@domain.com",
    "recipient": "john@example.com",
    "subject": "Hello",
    "snippet": "short preview",
    "receivedAt": "2026-04-12T10:00:00.000Z",
    "renderedContent": "hasil render html menjadi teks",
    "renderedSource": "parsed_html",
    "isRead": true,
    "isStarred": false,
    "isArchived": false
  }
}
```

Perilaku:

- Jika email belum terbaca, endpoint ini menandai email sebagai sudah dibaca.
- Tidak mengembalikan raw HTML/MIME.

## 6. Aturan Rendered Content (`read_email`)

Urutan sumber konten:

1. `parsed_html`
2. `body_html`
3. `parsed_text`
4. `body_text`
5. `snippet`
6. kosong (`empty`)

Jika sumber HTML dipakai (`parsed_html`/`body_html`), renderer akan:

1. Menghapus `script`, `style`, `noscript`
2. Mengubah elemen block menjadi line break
3. Mengubah `li` menjadi awalan `- `
4. Decode HTML entities dasar
5. Normalisasi whitespace
6. Membatasi output maksimum `20_000` karakter

Nilai `renderedSource` menunjukkan sumber final.

## 7. Endpoint Admin Issuance API Key

Semua endpoint ini wajib session owner.

### 7.1 `GET /api/worker-settings/api-key`

Response sukses (`200`):

```json
{
  "ok": true,
  "payload": {
    "hasActiveKey": true,
    "activeKey": {
      "id": "uuid",
      "name": "worker-settings",
      "createdBy": "web:owner@example.com",
      "createdAt": "2026-04-13 10:00:00"
    }
  }
}
```

### 7.2 `POST /api/worker-settings/api-key/generate`

Response sukses (`200`):

```json
{
  "ok": true,
  "payload": {
    "apiKey": "cmf_v1_xxx",
    "activeKey": {
      "id": "uuid",
      "name": "worker-settings",
      "createdBy": "web:owner@example.com",
      "createdAt": "2026-04-13 10:00:00"
    }
  }
}
```

Jika key aktif sudah ada (`409`):

```json
{
  "ok": false,
  "error": "Active API key already exists",
  "payload": {
    "hasActiveKey": true,
    "activeKey": {
      "id": "uuid",
      "name": "worker-settings",
      "createdBy": "web:owner@example.com",
      "createdAt": "2026-04-13 10:00:00"
    }
  }
}
```

### 7.3 `POST /api/worker-settings/api-key/regenerate`

Response sukses (`200`) sama dengan generate, tetapi key lama otomatis invalid.

## 8. Integrasi Telegram Command

Command yang didukung:

- `apikey`
- `apikey regen`

Aturan:

- hanya Telegram user id yang ada di `allowed_ids`
- `apikey`:
  - jika belum ada key aktif: generate dan kirim plaintext sekali
  - jika sudah ada key aktif: tampilkan status + instruksi `apikey regen`
- `apikey regen`: revoke key lama, buat key baru, kirim plaintext sekali
- jika API key di-generate/regenerate dari admin web (`/worker/settings`), sistem juga mengirim notifikasi API key ke Telegram

## 9. Baseline Keamanan

- Semua route `/api/public/v1/*` tidak bergantung session cookie.
- Plaintext API key tidak ditampilkan di endpoint status.
- Jangan log plaintext API key.
- Endpoint admin issuance wajib owner auth.

## 10. Checklist Audit Cepat

- [ ] API key hanya bisa diissue dari Telegram/admin settings.
- [ ] Prefix key selalu `cmf_v1_`.
- [ ] Key lama invalid setelah regenerate.
- [ ] Endpoint public v1 menolak key invalid (`401`).
- [ ] `read_email`/`read_emai` mengembalikan `renderedContent`, bukan raw HTML.

## 11. UAT Terpadu (Manual + Otomatis)

### 11.1 Prasyarat

1. Apply schema terbaru:

```bash
pnpm exec wrangler d1 execute mailflare-db --local --file ./schema.sql
```

2. Jalankan aplikasi lokal:

```bash
pnpm cf:dev
```

3. Login sebagai admin di UI.

### 11.2 UAT Otomatis (Direkomendasikan)

```bash
pnpm smoke:api-key:v1
```

Opsi cepat tanpa rebuild:

```bash
pnpm smoke:api-key:v1 --skip-build
```

### 11.3 UAT Manual Issuance API Key

1. Buka `/worker/settings`, card **API Key**.
2. Klik **Generate API Key** jika belum ada key aktif.
3. Pastikan plaintext key muncul sekali dengan prefix `cmf_v1_`.
4. Klik **Refresh Status**, plaintext tidak boleh tampil ulang.
5. Klik **Regenerate API Key**, pastikan key lama menjadi invalid.

### 11.4 UAT Manual Issuance dari Telegram

1. Pastikan Telegram user id ada di `allowed_ids`.
2. Kirim command `apikey`.
3. Jika key aktif sudah ada, bot harus memberi instruksi `apikey regen`.
4. Kirim `apikey regen`, pastikan key baru muncul dan key lama invalid.

### 11.5 UAT Manual Public API

Set API key:

```bash
# Bash
export API_KEY="cmf_v1_xxx"

# PowerShell
$env:API_KEY="cmf_v1_xxx"
```

`list_user`:

```bash
curl -X GET "http://127.0.0.1:8787/api/public/v1/list_user?limit=10&order=desc" \
  -H "x-api-key: $API_KEY"
```

`create_user`:

```bash
curl -X POST "http://127.0.0.1:8787/api/public/v1/create_user" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"username":"uatuser"}'
```

`user_mailbox`:

```bash
curl -X GET "http://127.0.0.1:8787/api/public/v1/user_mailbox?username=uatuser&limit=20" \
  -H "x-api-key: $API_KEY"
```

`read_email`:

```bash
curl -X GET "http://127.0.0.1:8787/api/public/v1/read_email?email_id=<EMAIL_ID>" \
  -H "x-api-key: $API_KEY"
```

Alias `read_emai`:

```bash
curl -X GET "http://127.0.0.1:8787/api/public/v1/read_emai?email_id=<EMAIL_ID>" \
  -H "x-api-key: $API_KEY"
```

### 11.6 UAT Negative Case Minimal

Invalid key:

```bash
curl -X GET "http://127.0.0.1:8787/api/public/v1/list_user" \
  -H "x-api-key: cmf_v1_invalid_key"
```

Expected: `401` + `UNAUTHORIZED`.

Endpoint admin tanpa session:

```bash
curl -X GET "http://127.0.0.1:8787/api/worker-settings/api-key"
```

Expected: `401` (dan `403` untuk user login non-owner).
