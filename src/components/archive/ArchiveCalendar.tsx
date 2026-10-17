// ArchiveCalendar (§9.6 export and props kept). An async Server Component: it works out the reader's
// today, keeps only `month`'s entries when given ('YYYY-MM'), and renders the week grid of Morrow
// EditionCards (the design's grid replaces a month calendar).
import type { ArchiveEntry } from '@/contracts/edition';
import { archiveWeeks } from './archive-weeks';
import { ArchiveGrid } from './ArchiveGrid';
import { readerToday } from './reader-today';

export interface ArchiveCalendarProps {
  entries: ArchiveEntry[];
  month?: string; // 'YYYY-MM'
}

export async function ArchiveCalendar({ entries, month }: ArchiveCalendarProps) {
  const today = await readerToday();
  const shown = month ? entries.filter((e) => e.date.startsWith(month)) : entries;
  return <ArchiveGrid weeks={archiveWeeks(shown, today)} />;
}

export default ArchiveCalendar;
