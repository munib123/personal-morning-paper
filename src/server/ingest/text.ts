import { parseHTML } from 'linkedom';

// Closing block tags and <br> get a trailing space so "</p><p>" never glues two words together.
const BLOCK_BOUNDARY = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr|td|th|section|article|header|footer|figcaption|ul|ol|dd|dt)\s*>|<br\s*\/?>/gi;

/**
 * Plain text of an HTML fragment (feed descriptions, content:encoded), whitespace collapsed.
 * linkedom only builds a body for a full document, so the fragment is wrapped in one.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return html.replace(/\s+/g, ' ').trim();
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html.replace(BLOCK_BOUNDARY, '$& ')}</body></html>`);
  for (const el of document.querySelectorAll('script, style, noscript, template')) el.remove();
  return (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function countWords(t: string): number {
  const s = t.trim();
  return s ? s.split(/\s+/).length : 0;
}

export function truncateWords(t: string, max: number): string {
  const parts = t.trim().split(/\s+/);
  return parts.length <= max ? t.trim() : parts.slice(0, max).join(' ');
}
