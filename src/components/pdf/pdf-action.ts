import { PdfFallbackSchema, ROUTES } from '@/contracts/api';

export type PdfAction = { kind: 'download' } | { kind: 'fallback'; href: string };

/** Same-site paths only, so a fallback can never send the reader off the site. */
const isSitePath = (href: string) => href.startsWith('/') && !href.startsWith('//');

/**
 * What to do with the PDF route's answer: save a PDF, or open the print route (the 503 body names it; anything
 * else, a 401 included, falls back to /paper/{date}/print).
 */
export function resolvePdfAction(res: { ok: boolean; status: number; contentType: string | null; body?: unknown }, date: string): PdfAction {
  if (res.ok && (res.contentType ?? '').toLowerCase().startsWith('application/pdf')) return { kind: 'download' };
  const parsed = PdfFallbackSchema.safeParse(res.body);
  const href = parsed.success && isSitePath(parsed.data.fallback) ? parsed.data.fallback : ROUTES.print(date);
  return { kind: 'fallback', href };
}
