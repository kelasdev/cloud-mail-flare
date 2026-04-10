const ACCESS_CODE_PREFIX = 'MF';
const ACCESS_CODE_SEGMENT_LENGTH = 4;
const ACCESS_CODE_SEGMENT_COUNT = 3;
const ACCESS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomIndex(maxExclusive: number): number {
  const random = crypto.getRandomValues(new Uint32Array(1));
  return random[0] % maxExclusive;
}

function randomSegment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ACCESS_CODE_CHARS[randomIndex(ACCESS_CODE_CHARS.length)];
  }
  return out;
}

export function generateAccessCode(): string {
  const segments: string[] = [ACCESS_CODE_PREFIX];
  for (let i = 0; i < ACCESS_CODE_SEGMENT_COUNT; i += 1) {
    segments.push(randomSegment(ACCESS_CODE_SEGMENT_LENGTH));
  }
  return segments.join('-');
}

export function normalizeAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isAccessCodeFormatValid(code: string): boolean {
  return /^MF(?:-[A-Z0-9]{4}){3}$/.test(code);
}
