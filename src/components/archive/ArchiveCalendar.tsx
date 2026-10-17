// STUB (L0) — owner: L7. Replace freely; keep the props.
import type { ArchiveEntry } from '@/contracts/edition';
import { ROUTES } from '@/contracts/api';
import { EditionCard } from '@/components/morrow';

export interface ArchiveCalendarProps {
  entries: ArchiveEntry[];
  month?: string; // 'YYYY-MM'
}

// Short list date, e.g. 'Sat 17 Oct'. Noon UTC keeps the calendar day stable in every timezone.
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (date: string) => SHORT_DATE.format(new Date(`${date}T12:00:00Z`));

// Past editions as a grid of EditionCards, newest first. Stub: flat grid; L7 adds the month
// calendar, week grouping, stories-read fill and the streak heatmap.
export function ArchiveCalendar({ entries, month }: ArchiveCalendarProps) {
  const shown = entries.filter((e) => !month || e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  if (shown.length === 0) {
    return <p className="ui-text text-ink-soft">No past editions yet. Each morning&apos;s paper is kept here once it is published.</p>;
  }
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((e) => (
        <li key={e.date}>
          <EditionCard date={shortDate(e.date)} edition={e.number} headline={e.leadHeadline} href={ROUTES.paper(e.date)} pdfHref={e.pdfUrl ?? ROUTES.pdf(e.date)} />
        </li>
      ))}
    </ul>
  );
}

export default ArchiveCalendar;
