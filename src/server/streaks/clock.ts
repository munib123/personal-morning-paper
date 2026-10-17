// Reader-local clock helpers. Pure: callers pass `now` (from requestNow()), never read the clock here.
import { addDays, localDate } from '@/server/time';

const FALLBACK_TZ = 'Asia/Karachi';
const MORNING_HOUR = 7;

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

/** The local hour 0–23 in `tz` (hourCycle h23). */
export function localHour(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: safeTz(tz), hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
}

/** The UTC offset of `tz` at `at`, in minutes ('GMT+05:30' → 330). */
function offsetMinutes(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name ?? '');
  if (!m) return 0; // 'GMT' alone is UTC
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutes : minutes;
}

/** Tomorrow's paper time: the next edition day (03:00 rollover) at 07:00 in `tz`, as a UTC ISO string. */
export function nextMorningIso(now: Date, tz: string): string {
  const zone = safeTz(tz);
  const [y, mo, d] = addDays(localDate(now, zone), 1).split('-').map(Number);
  const wallClock = Date.UTC(y, mo - 1, d, MORNING_HOUR, 0, 0);
  let at = wallClock - offsetMinutes(new Date(wallClock), zone) * 60000;
  // Re-check at the result in case a DST change sits between the guess and the answer.
  const corrected = wallClock - offsetMinutes(new Date(at), zone) * 60000;
  if (corrected !== at) at = corrected;
  return new Date(at).toISOString();
}
