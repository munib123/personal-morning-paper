import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ArchiveEntry } from '@/contracts/edition';
import { FIXTURE_ARCHIVE } from '@/contracts/fixtures';
import { ArchiveGrid } from './ArchiveGrid';
import { archiveWeeks } from './archive-weeks';

const T = '2026-10-17'; // a Saturday; weeks start on Monday

const entry = (date: string, over: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  date,
  number: 3,
  leadHeadline: `Lead on ${date}`,
  storiesRead: 2,
  qualified: true,
  pdfUrl: null,
  ...over,
});

describe('archiveWeeks', () => {
  it('sorts newest first and builds each card', () => {
    const weeks = archiveWeeks([entry('2026-10-15'), entry('2026-10-17', { pdfUrl: 'https://x/p.pdf' }), entry('2026-10-16')], T);
    const cards = weeks.flatMap((w) => w.cards);
    expect(cards.map((c) => c.date)).toEqual(['2026-10-17', '2026-10-16', '2026-10-15']);
    expect(cards[1]).toEqual({
      date: '2026-10-16',
      dateLabel: 'Fri 16 Oct',
      number: 3,
      headline: 'Lead on 2026-10-16',
      storiesRead: 2,
      qualified: true,
      href: '/paper/2026-10-16',
      pdfHref: '/api/editions/2026-10-16/pdf',
      today: false,
    });
    expect(cards[0]).toMatchObject({ today: true, pdfHref: 'https://x/p.pdf' });
  });

  it('groups by Monday weeks with calm labels', () => {
    const weeks = archiveWeeks([entry('2026-10-11'), entry('2026-10-17'), entry('2026-10-12')], T);
    expect(weeks.map((w) => w.label)).toEqual(['This week', 'Week of 5 Oct']);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-12', '2026-10-05']);
    expect(weeks[0].cards).toHaveLength(2);
    expect(weeks[1].cards.map((c) => c.date)).toEqual(['2026-10-11']);
  });

  it('has no weeks for no entries', () => {
    expect(archiveWeeks([], T)).toEqual([]);
  });
});

describe('ArchiveGrid', () => {
  it('shows a calm empty state', () => {
    expect(renderToStaticMarkup(createElement(ArchiveGrid, { weeks: [] }))).toContain('Your first paper lands here tomorrow morning.');
  });

  it('renders one Morrow EditionCard per edition under week headers', () => {
    const html = renderToStaticMarkup(createElement(ArchiveGrid, { weeks: archiveWeeks(FIXTURE_ARCHIVE, T) }));
    expect(html.match(/<article class="mw-edition/g)).toHaveLength(FIXTURE_ARCHIVE.length);
    expect(html).toContain(`No. ${FIXTURE_ARCHIVE[0].number}`);
    expect(html).toMatch(/class="mw-section__title">This week</);
    expect(html).toContain('Streak day');
    expect(html).toContain(`${FIXTURE_ARCHIVE[1].storiesRead} stories read`);
  });
});
