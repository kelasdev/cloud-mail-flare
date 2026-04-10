const PASSWORD_SCHEME = 'pbkdf2_sha256';
// Cloudflare runtime currently limits PBKDF2 iterations to <= 100000.
const PASSWORD_ITERATIONS = 100_000;
const DERIVED_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      iterations
    },
    key,
    DERIVED_BITS
  );

  return new Uint8Array(bits);
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, derivedB64] = storedHash.split('$');
  if (scheme !== PASSWORD_SCHEME || !iterationsRaw || !saltB64 || !derivedB64) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 10_000) {
    return false;
  }

  const salt = fromBase64(saltB64);
  const expected = fromBase64(derivedB64);
  try {
    const actual = await derivePbkdf2(password, salt, iterations);
    return safeEqual(actual, expected);
  } catch {
    // Avoid throwing from auth flow when runtime rejects unsupported iteration counts.
    return false;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function randomToken(): string {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(tokenBytes);
}

function randomIndex(maxExclusive: number): number {
  // 0x100000000 is 4294967296, the total number of values in Uint32
  const maxUnbiased = Math.floor(4294967296 / maxExclusive) * maxExclusive;
  const bytes = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < maxUnbiased) {
      return bytes[0] % maxExclusive;
    }
  }
}

function randomChar(chars: string): string {
  return chars[randomIndex(chars.length)];
}

export function generateSecurePassword(length = 18): string {
  if (length < 12) {
    throw new Error('Password length must be at least 12');
  }

  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%^&*_-+=?';
  const all = `${lowercase}${uppercase}${numbers}${symbols}`;

  const output = [
    randomChar(lowercase),
    randomChar(uppercase),
    randomChar(numbers),
    randomChar(symbols)
  ];

  while (output.length < length) {
    output.push(randomChar(all));
  }

  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }

  return output.join('');
}
