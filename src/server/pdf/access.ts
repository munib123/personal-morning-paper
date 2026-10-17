// Small request guards shared by the print route and the PDF download route.

/** A real calendar date written as 'YYYY-MM-DD' (so '2026-13-99' and '2026-02-30' are refused). */
export function isPaperDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** `?fixture=1` shows the fixture paper, but only in development or with DEMO_MODE=1. */
export function wantsFixture(flag: string | string[] | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return flag === '1' && (env.DEMO_MODE === '1' || env.NODE_ENV !== 'production');
}
