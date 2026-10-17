// Which view of the edition the reader sees: the Front page (desktop default) or the Bytes stack
// (phone default). The reader's own choice is a cookie, so the server renders the right view first.
export type ReaderView = 'front' | 'bytes';

export const VIEW_COOKIE = 'subah_view';
const ONE_YEAR_S = 31_536_000;
const MOBILE_UA = /iPhone|iPod|Android.+Mobile|Mobile Safari|Windows Phone|IEMobile|Opera Mini/i;

/** The cookie if it names a view, else the Sec-CH-UA-Mobile hint, else the user agent. */
export function resolveView(cookie: string | undefined, ua: string | null, chMobile: string | null): ReaderView {
  if (cookie === 'front' || cookie === 'bytes') return cookie;
  if (chMobile === '?1') return 'bytes';
  if (chMobile === '?0') return 'front';
  return ua && MOBILE_UA.test(ua) ? 'bytes' : 'front';
}

export function persistView(v: ReaderView): void {
  try {
    document.cookie = `${VIEW_COOKIE}=${v}; max-age=${ONE_YEAR_S}; path=/; samesite=lax`;
  } catch {
    // Cookies blocked: the choice lasts for this visit only.
  }
}

/** 'YYYY-MM-DD' that is a real calendar date (no 2026-13-99, no 2026-02-30). */
export function isEditionDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}
