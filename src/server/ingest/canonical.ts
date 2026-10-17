import { createHash } from 'node:crypto';

const isTrackingParam = (key: string) => {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || k === 'fbclid';
};

function parse(raw: string, base?: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    if (!base) return null;
    try {
      return new URL(raw, base);
    } catch {
      return null;
    }
  }
}

/**
 * The URL we store and hash (§10.1): http(s) only, no utm_* / fbclid, no fragment, query params
 * sorted, and one trailing slash stripped unless the path is the root. Relative links resolve
 * against `base` (the feed or item URL). Returns null when the input is not a usable URL.
 */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const u = parse(trimmed, base);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;

  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (isTrackingParam(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

/** articles.url_hash: sha256 hex of the canonical URL. */
export function urlHash(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}
