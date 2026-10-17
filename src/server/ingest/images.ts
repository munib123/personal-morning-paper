import { parseHTML } from 'linkedom';
import type { FeedItem, MediaNode } from './rss';

/** Case-insensitive substrings of image URLs that are logos, placeholders or site-wide defaults. */
export const GENERIC_IMAGE_PATTERNS = [
  'social-default',
  'default-og',
  'og-default',
  'placeholder',
  'no-image',
  'noimage',
  'spacer.gif',
  'blank.gif',
  'pixel.gif',
  'gravatar.com/avatar',
  '/logo',
  'arxiv-logo',
  'favicon',
] as const;

export function isGenericImage(url: string): boolean {
  const u = url.toLowerCase();
  return GENERIC_IMAGE_PATTERNS.some((p) => u.includes(p));
}

const NON_IMAGE_EXT = /\.(mp4|m4v|mov|webm|m3u8|mp3|m4a|ogg|wav|pdf)(\?|#|$)/i;

/** An absolute http(s) URL for `src`, resolved against `base` (relative and protocol-relative srcs). */
export function absoluteUrl(src: string | null | undefined, base: string): string | null {
  if (typeof src !== 'string') return null;
  const s = src.trim();
  if (!s || /^data:/i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    try {
      u = new URL(s, base);
    } catch {
      return null;
    }
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
}

function usable(src: string | null | undefined, base: string): string | null {
  const abs = absoluteUrl(src, base);
  return abs && !isGenericImage(abs) ? abs : null;
}

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const attrs = (m: MediaNode | string) => (typeof m === 'object' && m !== null ? (m.$ ?? null) : null);

/** The first usable <img> in an HTML fragment: skips data: URIs, 1×1 tracking pixels and generic images; reads lazy-load srcs too. */
export function firstImgSrc(html: string, base: string): string | null {
  if (!html || !/<img\b/i.test(html)) return null;
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  for (const img of document.querySelectorAll('img')) {
    if (img.getAttribute('width') === '1' || img.getAttribute('height') === '1') continue;
    for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
      const url = usable(img.getAttribute(attr), base);
      if (url) return url;
    }
  }
  return null;
}

/**
 * The feed's lead image (§10.1), in order: media:content (images only) → media:thumbnail →
 * enclosure[type^=image] → the first <img> in content:encoded / description. Generic images are
 * skipped and every URL is made absolute against `base` (the item link).
 */
export function pickFeedImage(item: FeedItem, base: string): string | null {
  for (const m of asArray(item['media:content'])) {
    const a = attrs(m);
    if (!a?.url) continue;
    const medium = a.medium?.toLowerCase();
    const type = a.type?.toLowerCase();
    if (medium ? medium !== 'image' : type ? !type.startsWith('image/') : NON_IMAGE_EXT.test(a.url)) continue;
    const url = usable(a.url, base);
    if (url) return url;
  }
  for (const t of asArray(item['media:thumbnail'])) {
    const url = usable(attrs(t)?.url, base);
    if (url) return url;
  }
  const enc = item.enclosure;
  if (enc?.url) {
    const type = enc.type?.toLowerCase();
    if (type ? type.startsWith('image/') : /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(enc.url)) {
      const url = usable(enc.url, base);
      if (url) return url;
    }
  }
  for (const html of [item['content:encoded'], item.content, item.summary]) {
    if (typeof html !== 'string') continue;
    const url = firstImgSrc(html, base);
    if (url) return url;
  }
  return null;
}
