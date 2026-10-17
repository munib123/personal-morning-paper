import { Icon } from '@/components/morrow';
import type { StreakView } from '@/contracts/streak';
import { shortDate, statusText, weekdayInitial } from './copy';

export interface StreakStripProps {
  last7: StreakView['last7'];
  /** 'lg' (the streak sheet and /me): seven columns across the panel, ticks in read days, today named. */
  size?: 'sm' | 'lg';
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
export function StreakStrip({ last7, size = 'sm' }: StreakStripProps) {
  if (size === 'lg') {
    const today = last7.at(-1)?.date;
    return (
      <ol className="m-0 grid list-none grid-cols-7 gap-2 p-0" aria-label="Your last 7 mornings">
        {last7.map((d) => {
          const isToday = d.date === today;
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span aria-hidden="true" className={`flex size-8 items-center justify-center rounded-none text-on-ink ${SQUARE[d.status]}`}>
                {d.status === 'read' ? <Icon name="check" size={16} /> : null}
              </span>
              <span aria-hidden="true" className={isToday ? 'ui-meta font-semibold text-ink underline decoration-ink underline-offset-4' : 'ui-meta text-ink-muted'}>
                {isToday ? 'Today' : weekdayInitial(d.date)}
              </span>
              <span className="sr-only">{`${isToday ? 'Today, ' : ''}${shortDate(d.date)}: ${statusText(d.status)}`}</span>
            </li>
          );
        })}
      </ol>
    );
  }
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
