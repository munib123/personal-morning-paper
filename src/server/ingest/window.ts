import type { RawItem } from './types';

const HOUR_MS = 3_600_000;
// Feeds stamp items a little ahead of time (timezone slips); more than this is a bad date.
const MAX_FUTURE_MS = HOUR_MS;

const epochMs = (n: number) => (n < 1e12 ? n * 1000 : n); // below 1e12 it is epoch seconds (HN `time`)

/**
 * The publication time we store. A missing or unparseable date, or one more than an hour in the
 * future, becomes `now` (the first-seen time, §10.1). Numbers (and numeric strings) are epoch
 * seconds below 1e12, else epoch milliseconds.
 */
export function resolvePublishedAt(raw: string | number | null | undefined, now: Date): Date {
  let t = Number.NaN;
  if (typeof raw === 'number') {
    t = epochMs(raw);
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    t = /^\d+$/.test(s) ? epochMs(Number(s)) : Date.parse(s);
  }
  if (!Number.isFinite(t) || t > now.getTime() + MAX_FUTURE_MS) return new Date(now.getTime());
  return new Date(t);
}

/**
 * The 48 h window and per-source cap: drops items published before `now - sinceHours`, then keeps
 * the `maxPerSource` newest, newest first. `skippedOld` counts only the window drops.
 */
export function filterAndCap(
  items: RawItem[],
  now: Date,
  sinceHours: number,
  maxPerSource: number,
): { kept: RawItem[]; skippedOld: number } {
  const cutoff = now.getTime() - sinceHours * HOUR_MS;
  const dated = items.map((item) => ({ item, t: resolvePublishedAt(item.publishedRaw, now).getTime() }));
  const fresh = dated.filter((d) => d.t >= cutoff).sort((a, b) => b.t - a.t);
  return { kept: fresh.slice(0, Math.max(0, maxPerSource)).map((d) => d.item), skippedOld: dated.length - fresh.length };
}
