# Audit: Penggunaan escapeMarkdownV2 di telegram.ts

## Ringkasan Perbaikan

Dokumentasi lengkap tentang semua penggunaan `escapeMarkdownV2` dan perbaikan yang telah dilakukan untuk menangani special character dengan benar, khususnya karakter pipe `|`.

## Issue yang Ditemukan dan Diperbaiki

### Issue 1: Regex MARKDOWN_V2_SPECIAL Tidak Didokumentasikan
**Status**: ✅ FIXED

**Lokasi Sebelum**: Line 9
```typescript
const MARKDOWN_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;
```

**Perbaikan**:
- Ditambahkan dokumentasi lengkap mengenai regex
- Ditambahkan pattern terpisah untuk pipe character: `MARKDOWN_V2_PIPE_PATTERN`
- Documented bahwa karakter `|` sudah termasuk dalam MARKDOWN_V2_SPECIAL

**Sekarang**: Line 10-17
```typescript
/**
 * Regex untuk escape karakter special di MarkdownV2 format Telegram.
 * Per Telegram Bot API Documentation (MarkdownV2):
 * Karakter yang harus di-escape: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 * 
 * Urutan dalam regex tidak penting, tapi kami gunakan grup capturing untuk replace.
 */
const MARKDOWN_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;
const MARKDOWN_V2_PIPE_PATTERN = /\|/g;
```

### Issue 2: Tidak Ada Fungsi Validasi Untuk Escaped Content
**Status**: ✅ FIXED

**Lokasi**: Line 1338-1353

**Penambahan Fungsi Baru**:

#### 1. `escapeMarkdownV2(value: string): string`
Fungsi utama yang escape semua special character dengan backslash.
- Input: string dengan special character
- Output: string dengan semua special character di-escape
- Contoh: `"hello|world"` → `"hello\|world"`

#### 2. `escapePipeCharacter(value: string): string`
Fungsi khusus untuk escape hanya karakter pipe, berguna untuk konteks tertentu.
- Input: string dengan pipe character
- Output: string dengan pipe yang di-escape
- Contoh: `"col1 | col2"` → `"col1 \| col2"`

#### 3. `isMarkdownV2Escaped(value: string): boolean`
Fungsi validasi untuk check apakah string sudah di-escape dengan benar.
- Input: string yang ingin di-validate
- Output: boolean (true jika sudah benar di-escape)
- Menggunakan negative lookbehind untuk detect unescaped character

### Issue 3: Tidak Ada Documentation untuk Usage Context
**Status**: ✅ FIXED

**Penambahan**:
- JSDoc comments untuk setiap fungsi
- Contoh usage dalam dokumentasi
- Catatan tentang edge cases

## Audit Detail: Semua Penggunaan escapeMarkdownV2

### 1. Error Messages (Unauthorized, Invalid Input, etc.)
**Lines**: 436, 523, 544, 547, 560, 566, 619, 625, 642, 684, 690

**Pola**:
```typescript
await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2(errorMessage));
```

**Status**: ✅ BENAR
- Error message harus di-escape karena bisa berisi special character
- Semua penggunaan sudah konsisten

**Contoh**:
```typescript
// Line 523
await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2(invalidReason));

// Line 544
await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Username already exists.'));
```

### 2. List Number dan Display Items
**Lines**: 595, 597, 598, 762 (multiple)

**Pola**:
```typescript
const num = escapeMarkdownV2(String(index + 1));
const sender = escapeMarkdownV2(truncate(compactWhitespace(String(row.sender ?? '')), 80));
const subject = escapeMarkdownV2(truncate(compactWhitespace(String(row.subject ?? '(No Subject)')), 80));
```

**Status**: ✅ BENAR
- Semua display data yang bisa berisi special character sudah di-escape
- Number juga di-escape untuk konsistensi

**Line 762 - Special Case**:
```typescript
`Menampilkan ${escapeMarkdownV2(String(start))}\\-${escapeMarkdownV2(String(end))} dari ${escapeMarkdownV2(String(total))}`
```

**Status**: ⚠️ PERHATIAN - Sudah Benar Tapi Redundan
- Angka `start`, `end`, `total` tidak mungkin berisi special character
- Tapi tidak merugikan untuk di-escape juga (defensive programming)
- Catatan: `\\-` di sini adalah dash yang sudah di-hardcode escape

### 3. Email Detail Display
**Lines**: 926, 972, 973, 974

**Pola**:
```typescript
`*Subjek:* ${escapeMarkdownV2(subject)}`,
`*Dari    :* ${escapeMarkdownV2(senderAddress)}`,
`*Ke      :* ${escapeMarkdownV2(recipientAddress)}`,
`*Subject :* ${escapeMarkdownV2(subject)}`,
```

**Status**: ✅ BENAR - CRITICAL
- Email subject, sender, recipient adalah user-supplied data yang bisa berisi:
  - Email address dengan special char di sebelum @: `user+tag@example.com`
  - Display name dengan karakter special: `John (CEO) Doe`
  - Pipe dalam display: `John | Doe Limited`
- Semua sudah di-escape dengan benar

### 4. Code Block Content (Line 925, 935)
**Pola**:
```typescript
`> ${inlineCodeMd(`${email.sender} | ${email.recipient} | ${email.id}`)}`
'```text',
sanitizeCodeBlock(body || '(empty body)'),
'```'
```

**Status**: ✅ BENAR - SPECIAL HANDLING
- Content dalam backtick (code block) tidak perlu di-escape dengan `escapeMarkdownV2`
- Gunakan `inlineCodeMd()` untuk inline code atau `sanitizeCodeBlock()` untuk text block
- Fungsi-fungsi khusus ini hanya escape backtick dan backslash (per Telegram spec)
- **IMPORTANT**: Pipe `|` dalam code block TIDAK boleh di-escape dengan escapeMarkdownV2

### 5. Hard-coded Markdown Commands
**Lines**: 950-956

**Pola**:
```typescript
'\\- \\`adduser \\<username\\>\\`',
'\\- \\`listuser \\<asc|desc\\>\\`',
...
```

**Status**: ⚠️ PERLU PERHATIAN - Pipe dalam Command Display

**Current**: Hard-coded escape dengan `\\`
```typescript
'\\- \\`listuser \\<asc|desc\\>\\`'
```

**Analysis**:
- Ini adalah help text yang hard-coded
- Pipe dalam backtick (code block) tidak perlu di-escape lagi
- Current implementation: `\\<asc|desc\\>` 
- Pipe di sini tidak di-escape karena dalam backtick
- ✅ BENAR (tapi untuk clarity, bisa ditambahkan comment)

## Temuan Penting: Konteks Pipe Character `|`

### Analisis Penggunaan Pipe di Seluruh File

#### 1. Type Union (TypeScript) - NOT IN MARKDOWN
**Lokasi**: Line 11, 82, 131, dst
- Ini adalah TypeScript syntax, bukan Telegram MarkdownV2
- ✅ TIDAK perlu escape

#### 2. Pipe dalam Text Display (Line 757)
**Code**:
```typescript
rows.map((row, index) => `${safeOffset + index + 1}. ${extractUsername(String(row.email ?? ''))} | ${String(row.email ?? '')}`)
```

**Action**: Pipe ini digunakan sebagai delimiter dalam list
- Line 757 adalah dalam `bodyLines` yang kemudian di-wrap dalam code block
- ✅ TIDAK perlu di-escape (sudah dalam code block context)

#### 3. Pipe dalam Email Info (Line 925)
**Code**:
```typescript
`> ${inlineCodeMd(`${email.sender} | ${email.recipient} | ${email.id}`)}`
```

**Analysis**:
- Pipe digunakan dalam `inlineCodeMd()` result
- ✅ BENAR - tidak perlu di-escape (dalam code context)

#### 4. Pipe dalam Command Help (Line 950-956)
**Code**:
```typescript
'\\- \\`listuser \\<asc|desc\\>\\`'
```

**Analysis**:
- Pipe dalam backtick
- ✅ BENAR - tidak perlu di-escape (dalam code context)

## Konsistensi Patterns

### Pattern 1: User-Supplied Display Data ✅
```typescript
const subject = escapeMarkdownV2(truncate(compactWhitespace(String(row.subject ?? '(No Subject)')), 80));
```
- User-supplied data dari database
- HARUS di-escape
- ✅ Sudah konsisten di seluruh file

### Pattern 2: System Error Messages ✅
```typescript
await sendTelegramMessage(context.config.token, context.chatId, escapeMarkdownV2('Username already exists.'));
```
- Error message yang mungkin berisi user input
- HARUS di-escape
- ✅ Sudah konsisten di seluruh file

### Pattern 3: Code Block Content ✅
```typescript
'```text',
sanitizeCodeBlock(body || '(empty body)'),
'```'
```
- Content dalam code block
- Gunakan `sanitizeCodeBlock()` bukan `escapeMarkdownV2()`
- ✅ Sudah konsisten di seluruh file

### Pattern 4: Inline Code ✅
```typescript
inlineCodeMd(email.user_email)
```
- Inline code dengan backtick
- Gunakan `inlineCodeMd()` bukan `escapeMarkdownV2()`
- ✅ Sudah konsisten di seluruh file

## Test Coverage

Unit tests sudah dibuat di `telegram.test.ts` untuk:

1. ✅ Escape underscore
2. ✅ Escape asterisk
3. ✅ Escape pipe character
4. ✅ Escape brackets
5. ✅ Escape parentheses
6. ✅ Escape tilde
7. ✅ Escape backtick
8. ✅ Escape greater than
9. ✅ Escape hash
10. ✅ Escape plus
11. ✅ Escape hyphen
12. ✅ Escape equals
13. ✅ Escape braces
14. ✅ Escape dot
15. ✅ Escape exclamation
16. ✅ Escape backslash
17. ✅ Escape multiple characters
18. ✅ Handle empty string
19. ✅ Handle string with no special characters
20. ✅ Handle complex email address
21. ✅ Handle command with pipes
22. ✅ escapePipeCharacter function
23. ✅ Complex scenarios (email list, subject line, sender/recipient)
24. ✅ Edge cases (long strings, consecutive special chars, unicode, newlines)

## Recommendations dan Best Practices

### 1. Context-Aware Escaping ✅
- **User-Supplied Data**: Gunakan `escapeMarkdownV2()`
- **Code Blocks**: Gunakan `sanitizeCodeBlock()`
- **Inline Code**: Gunakan `inlineCodeMd()`

### 2. Pipe Character Handling ✅
- Sudah di-escape dalam `escapeMarkdownV2()`
- Tidak perlu di-escape dalam code block
- Helper function `escapePipeCharacter()` tersedia untuk use case spesifik

### 3. Documentation ✅
- Setiap fungsi memiliki JSDoc lengkap
- Regex MARKDOWN_V2_SPECIAL sudah di-dokumentasikan
- Edge cases sudah dijelaskan

### 4. Testing ✅
- Unit tests komprehensif sudah tersedia di `telegram.test.ts`
- Test cover semua special character individual
- Test cover kombinasi dan edge case

## Kesimpulan

Semua issue telah diperbaiki:

1. ✅ **Regex ValidatI**: MARKDOWN_V2_SPECIAL sudah benar dan didokumentasikan
2. ✅ **Pipe Escape**: Sudah di-escape dengan benar di semua konteks
3. ✅ **Konsistensi**: Semua penggunaan escapeMarkdownV2 sudah konsisten
4. ✅ **Test Coverage**: Unit tests komprehensif sudah dibuat

**Status**: READY FOR PRODUCTION

Catatan: - Negative lookbehind (`(?<!\\)`) dalam `isMarkdownV2Escaped()` mungkin tidak kompatibel dengan beberapa environment lama (IE, Node < 8.10 tanpa flag). Jika perlu, gunakan versi simplified atau polyfill. - Semua test dapat dijalankan dengan: `npm run test` atau `vitest telegram.test.ts`
