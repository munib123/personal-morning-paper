// Past editions grouped by week (Monday start), newest first. Pure: `today` is the reader's local date.
import { ROUTES } from '@/contracts/api';
import type { ArchiveEntry } from '@/contracts/edition';

export interface ArchiveCardData {
  date: string;
  dateLabel: string; // 'Fri 16 Oct'
  number: number;
  headline: string;
  storiesRead: number;
  qualified: boolean;
  href: string;
  pdfHref: string;
  today: boolean;
}

export interface ArchiveWeek {
  weekStart: string; // the Monday, 'YYYY-MM-DD'
  label: string; // 'This week' | 'Week of 5 Oct'
  cards: ArchiveCardData[];
}

const atNoon = (date: string) => new Date(`${date}T12:00:00Z`); // noon UTC: the calendar day never shifts
const SHORT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function addDaysUtc(date: string, n: number): string {
  const d = atNoon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before `date`. */
export function weekStartOf(date: string): string {
  const dow = atNoon(date).getUTCDay(); // 0 = Sunday
  return addDaysUtc(date, -((dow + 6) % 7));
}

export function archiveWeeks(entries: ArchiveEntry[], today: string): ArchiveWeek[] {
  const thisWeek = weekStartOf(today);
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const weeks: ArchiveWeek[] = [];
  for (const e of sorted) {
    const weekStart = weekStartOf(e.date);
    let week = weeks.at(-1);
    if (!week || week.weekStart !== weekStart) {
      week = { weekStart, label: weekStart === thisWeek ? 'This week' : `Week of ${DAY_MONTH.format(atNoon(weekStart))}`, cards: [] };
      weeks.push(week);
    }
    week.cards.push({
      date: e.date,
      dateLabel: SHORT.format(atNoon(e.date)).replace(',', ''),
      number: e.number,
      headline: e.leadHeadline,
      storiesRead: e.storiesRead,
      qualified: e.qualified,
      href: ROUTES.paper(e.date),
      pdfHref: e.pdfUrl ?? ROUTES.pdf(e.date),
      today: e.date === today,
    });
  }
  return weeks;
}
