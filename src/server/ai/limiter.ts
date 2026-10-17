// Per-model request pacing and the rate-limit breaker (ARCHITECTURE §11). Request starts are spaced
// 60000 / rpm ms apart per model; a model marked limited is skipped until its time is up.

let sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextStart = new Map<string, number>();
const limitedUntil = new Map<string, number>();
// Waits this short are not worth a timer; slots still advance by the full gap, so pacing holds on average.
const MIN_WAIT_MS = 50;

export function sleep(ms: number): Promise<void> {
  return sleepFn(ms);
}

/**
 * Reserves the model's next request slot and waits for it. Returns false (reserving nothing) when the
 * slot would start after `deadline`.
 */
export async function pace(modelId: string, rpm: number, deadline = Infinity): Promise<boolean> {
  const gap = 60_000 / rpm;
  const now = Date.now();
  const slot = Math.max(now, nextStart.get(modelId) ?? 0);
  if (slot > deadline) return false;
  nextStart.set(modelId, slot + gap);
  const wait = slot - now;
  if (wait >= MIN_WAIT_MS) await sleepFn(wait);
  return true;
}

export function markLimited(modelId: string, untilMs: number): void {
  limitedUntil.set(modelId, Math.max(untilMs, limitedUntil.get(modelId) ?? 0));
}

export function isLimited(modelId: string, now: number = Date.now()): boolean {
  return (limitedUntil.get(modelId) ?? 0) > now;
}

/** The next 00:00 America/Los_Angeles after `now` (Gemini's daily quota reset; 12:00 PKT in October). */
export function nextQuotaReset(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const sinceMidnight = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + (now % 1000);
  return now - sinceMidnight + 86_400_000;
}

/** Tests only. */
export function __resetLimiter(): void {
  nextStart.clear();
  limitedUntil.clear();
}

/** Tests only: replace the sleep (null restores setTimeout). */
export function __setSleep(fn: ((ms: number) => Promise<void>) | null): void {
  sleepFn = fn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}
