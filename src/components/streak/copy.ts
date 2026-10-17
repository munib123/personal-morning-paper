// Streak copy (design README "Voice and copy"): calm, short, sentence case, "you" and "your paper".
// No exclamation marks, no emoji, no shame: a broken streak leads with the reading days so far.
import type { DayStatus, StreakView } from '@/contracts/streak';
import { MILESTONES } from '@/server/streaks/compute';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
const readingDays = (n: number) => (n === 1 ? '1 reading day' : `${n} reading days`);

/** The chip's accessible name. */
export function chipLabel(v: StreakView): string {
  switch (v.state) {
    case 'new':
      return 'Read 1 story to start your streak';
    case 'done_today':
      return `Reading streak: ${days(v.current)}, read today`;
    case 'pending':
    case 'at_risk':
      return `Reading streak: ${days(v.current)}. Read 1 story today to keep it`;
    case 'frozen':
      return `Reading streak: ${days(v.current)}. A freeze saved yesterday`;
    case 'repairable':
      return `Reading streak: ${days(v.current)}. Catch up on yesterday to keep it`;
    case 'broken':
      return `${readingDays(v.totalDays)} so far. Read 1 story to start a new streak`;
    default:
      return unreachable(v.state);
  }
}

/** The chip's visible line (a dateline, so CSS sets it in caps: "6-DAY STREAK"). */
export function chipText(v: StreakView): string {
  switch (v.state) {
    case 'new':
      return 'Start a streak';
    case 'done_today':
    case 'pending':
      return `${v.current}-day streak`;
    case 'at_risk':
      return `${v.current}-day streak · read 1 story today`;
    case 'frozen':
      return `${v.current}-day streak · freeze used`;
    case 'repairable':
      return `${v.current}-day streak · catch up today`;
    case 'broken':
      return readingDays(v.totalDays);
    default:
      return unreachable(v.state);
  }
}

/** The streak sheet's headline. */
export function sheetHeadline(v: StreakView): string {
  switch (v.state) {
    case 'new':
      return 'Read 1 story to start your streak';
    case 'done_today':
      return `Day ${v.current} of your streak`;
    case 'pending':
      return `Read 1 story today to keep your ${v.current}-day streak`;
    case 'at_risk':
      return `Your paper's still warm: 1 story keeps your ${v.current}-day streak`;
    case 'frozen':
      return `A freeze saved yesterday. Your streak is ${days(v.current)}`;
    case 'repairable':
      return `Catch up on yesterday's paper (3 questions) to keep your ${v.current}-day streak`;
    case 'broken':
      return `${readingDays(v.totalDays)} so far`;
    default:
      return unreachable(v.state);
  }
}

const MILESTONE_LINES: Record<number, string> = {
  3: 'Three mornings in a row.',
  7: 'A week of mornings.',
  14: 'Two weeks of mornings.',
  30: 'A month of mornings.',
  50: '50 mornings in a row.',
  100: '100 mornings in a row.',
};

/** One calm line per milestone (3, 7, 14, 30, 50, 100), else null. */
export function milestoneLine(n: number): string | null {
  return MILESTONE_LINES[n] ?? null;
}

/** The highest milestone reached by a run of `current` days, or null below 3. */
export function highestMilestone(current: number): number | null {
  let best: number | null = null;
  for (const m of MILESTONES) if (m <= current) best = m;
  return best;
}

/** Hidden text for one square of the 7-day strip ("Sat 17 Oct: read"). */
export function statusText(s: DayStatus): string {
  switch (s) {
    case 'read':
      return 'read';
    case 'missed':
      return 'not read';
    case 'today':
      return 'today, not read yet';
    case 'frozen':
      return 'covered by a freeze';
    case 'repaired':
      return 'caught up';
    case 'future':
      return 'still to come';
    default:
      return unreachable(s);
  }
}

// Short list date, e.g. 'Sat 17 Oct'. Noon UTC keeps the calendar day stable in every timezone.
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const WEEKDAY_NARROW = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' });

export const shortDate = (date: string): string => SHORT_DATE.format(new Date(`${date}T12:00:00Z`)).replace(',', '');
export const weekdayInitial = (date: string): string => WEEKDAY_NARROW.format(new Date(`${date}T12:00:00Z`));

function unreachable(x: never): never {
  throw new Error(`unexpected value: ${String(x)}`);
}
