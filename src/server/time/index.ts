import { cookies } from 'next/headers';

const DEMO_COOKIE = 'subah_now';
const FALLBACK_TZ = 'Asia/Karachi';
// A reader's day ends at 03:00 local time, so a 01:30 read still counts for "today's" paper.
const ROLLOVER_MS = 3 * 60 * 60 * 1000;

/**
 * The request's notion of "now". With DEMO_MODE=1 the demo clock cookie (ISO 8601 UTC) wins.
 * Outside a request scope (scripts, jobs) cookies() throws, so we fall back to the real clock.
 */
export async function requestNow(): Promise<Date> {
  const real = new Date();
  let raw: string | undefined;
  try {
    // Always read cookies: touching a request API makes every page that uses requestNow() render
    // per request, instead of being prerendered with the build day's date frozen in.
    raw = (await cookies()).get(DEMO_COOKIE)?.value;
  } catch {
    return real; // outside a request scope (scripts, jobs)
  }
  if (process.env.DEMO_MODE !== '1' || !raw) return real;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? real : new Date(t);
}

function formatDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** 'YYYY-MM-DD' in the reader's timezone, with the 03:00 rollover. Unknown timezones fall back to Asia/Karachi. */
export function localDate(at: Date, tz: string): string {
  const shifted = new Date(at.getTime() - ROLLOVER_MS);
  try {
    return formatDate(shifted, tz);
  } catch {
    return formatDate(shifted, FALLBACK_TZ);
  }
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
