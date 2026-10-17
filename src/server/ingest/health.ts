/** A source that fails this many runs in a row is set inactive (§10.1); one success resets the count. */
export const MAX_CONSECUTIVE_FAILURES = 5;

export function nextHealth(prev: { failCount: number }, ok: boolean): { failCount: number; active: boolean } {
  if (ok) return { failCount: 0, active: true };
  const failCount = prev.failCount + 1;
  return { failCount, active: failCount < MAX_CONSECUTIVE_FAILURES };
}
