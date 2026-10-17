import { EditionCard, Icon, SectionHeader } from '@/components/morrow';
import type { ArchiveWeek } from './archive-weeks';

const storiesLine = (n: number) => (n === 1 ? '1 story read' : `${n} stories read`);

/**
 * Past editions as Morrow EditionCards, newest first, grouped by week under a SectionHeader each.
 * Each card opens the edition as published and offers its stored PDF; old papers are never rebuilt.
 */
export function ArchiveGrid({ weeks }: { weeks: ArchiveWeek[] }) {
  if (weeks.length === 0) {
    return <p className="reader-enter ui-text text-ink-muted">Your first paper lands here tomorrow morning.</p>;
  }
  return (
    <div className="reader-enter flex flex-col gap-10">
      {weeks.map((week) => (
        <section key={week.weekStart} aria-label={week.label}>
          <SectionHeader title={week.label} meta={week.cards.length === 1 ? '1 edition' : `${week.cards.length} editions`} />
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {week.cards.map((c) => (
              <li key={c.date} className="flex flex-col gap-2">
                <EditionCard date={c.dateLabel} edition={c.number} headline={c.headline} href={c.href} pdfHref={c.pdfHref} today={c.today} />
                <p className="ui-meta flex items-center gap-2 text-ink-muted">
                  <span>{storiesLine(c.storiesRead)}</span>
                  {c.qualified ? (
                    <span className="inline-flex items-center gap-1 text-ink">
                      <Icon name="check" size={14} />
                      Streak day
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default ArchiveGrid;
