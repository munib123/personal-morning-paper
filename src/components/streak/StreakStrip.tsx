import type { StreakView } from '@/contracts/streak';
import { shortDate, statusText, weekdayInitial } from './copy';

export interface StreakStripProps {
  last7: StreakView['last7'];
}

// Square shape per state, never colour alone: filled ink = read, outlined = not read, dashed = today
// (not read yet). Every square also carries hidden text ("Sat 17 Oct: read").
const SQUARE: Record<StreakView['last7'][number]['status'], string> = {
  read: 'bg-ink border border-ink',
  missed: 'border border-rule-strong',
  today: 'border border-dashed border-ink',
  frozen: 'border border-ink bg-[linear-gradient(to_top,var(--ink)_50%,transparent_50%)]',
  repaired: 'border border-ink bg-[linear-gradient(to_top,var(--ink)_50%,transparent_50%)]',
  future: 'border border-rule',
};

/** The last 7 mornings as 7 small squares with weekday initials. */
export function StreakStrip({ last7 }: StreakStripProps) {
  return (
    <ol className="flex gap-3" aria-label="Your last 7 mornings">
      {last7.map((d) => (
        <li key={d.date} className="flex flex-col items-center gap-1">
          <span aria-hidden="true" className={`block size-3 rounded-none ${SQUARE[d.status]}`} />
          <span aria-hidden="true" className="ui-meta text-ink-muted">
            {weekdayInitial(d.date)}
          </span>
          <span className="sr-only">{`${shortDate(d.date)}: ${statusText(d.status)}`}</span>
        </li>
      ))}
    </ol>
  );
}

export default StreakStrip;
