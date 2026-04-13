export type RenderedSource = 'parsed_html' | 'body_html' | 'parsed_text' | 'body_text' | 'snippet' | 'empty';

export interface RenderedEmailInput {
  parsedHtml?: string | null;
  bodyHtml?: string | null;
  parsedText?: string | null;
  bodyText?: string | null;
  snippet?: string | null;
}

export interface RenderedEmailResult {
  renderedContent: string;
  renderedSource: RenderedSource;
}

const MAX_RENDERED_LENGTH = 20_000;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

export function renderEmailContent(input: RenderedEmailInput): RenderedEmailResult {
  const parsedHtml = String(input.parsedHtml ?? '').trim();
  if (parsedHtml) {
    return {
      renderedContent: truncate(renderHtmlToText(parsedHtml), MAX_RENDERED_LENGTH),
      renderedSource: 'parsed_html'
    };
  }

  const bodyHtml = String(input.bodyHtml ?? '').trim();
  if (bodyHtml) {
    return {
      renderedContent: truncate(renderHtmlToText(bodyHtml), MAX_RENDERED_LENGTH),
      renderedSource: 'body_html'
    };
  }

  const parsedText = String(input.parsedText ?? '').trim();
  if (parsedText) {
    return {
      renderedContent: truncate(normalizeText(parsedText), MAX_RENDERED_LENGTH),
      renderedSource: 'parsed_text'
    };
  }

  const bodyText = String(input.bodyText ?? '').trim();
  if (bodyText) {
    return {
      renderedContent: truncate(normalizeText(bodyText), MAX_RENDERED_LENGTH),
      renderedSource: 'body_text'
    };
  }

  const snippet = String(input.snippet ?? '').trim();
  if (snippet) {
    return {
      renderedContent: truncate(normalizeText(snippet), MAX_RENDERED_LENGTH),
      renderedSource: 'snippet'
    };
  }

  return {
    renderedContent: '',
    renderedSource: 'empty'
  };
}

function renderHtmlToText(html: string): string {
  const withoutUnsafeBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const withListItems = withoutUnsafeBlocks
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<\/\s*li\s*>/gi, '\n');

  const withLineBreaks = withListItems
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|section|article|header|footer|main|aside|h[1-6]|tr|table)\s*>/gi, '\n');

  const noTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeText(decodeHtmlEntities(noTags));
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entityRaw: string) => {
    const entity = String(entityRaw ?? '');
    const lower = entity.toLowerCase();

    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : full;
    }

    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : full;
    }

    return NAMED_ENTITIES[lower] ?? full;
  });
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
    return '';
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function normalizeText(input: string): string {
  const normalized = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/[ \t\f\v]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

  return normalized;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}
