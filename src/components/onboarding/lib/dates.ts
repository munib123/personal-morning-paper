// Dates are written in full on the paper (design README "Voice and copy"): 'Saturday, 17 October 2026'.
// Input is a reader-local 'YYYY-MM-DD' (from localDate on the server), formatted at UTC noon so no
// timezone can move it to another day.
export function longDate(ymd: string): string {
  const at = new Date(`${ymd}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(at.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}
