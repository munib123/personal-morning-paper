// STUB (L0) — owner: L6. Replace freely; keep the route.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Masthead } from '@/components/morrow';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { BRAND } from '@/lib/brand';
import { getEdition } from '@/server/edition';
import { getProfile } from '@/server/profile';

export const metadata: Metadata = { title: 'Print edition' };

// The print template: used for the PDF render and the window.print() fallback. It sits outside the reader shell,
// always in the Morning theme, with no interactive affordances. Stub: the fixture edition as one long column list.
export default async function PrintPage({ params }: PageProps<'/paper/[date]/print'>) {
  const { date } = await params;
  const edition = await getEdition(FIXTURE_USER_ID, date);
  if (!edition) notFound();
  const profile = await getProfile(FIXTURE_USER_ID);
  const reader = profile?.displayName?.trim().split(/\s+/)[0] || undefined;
  const sources = new Set(edition.items.map((item) => item.article.sourceName)).size;

  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-col gap-6 px-4 py-8 md:px-6">
      <Masthead
        title={BRAND.nameplate}
        date={longDate(edition.date)}
        edition={edition.number}
        reader={reader}
        location={profile?.city}
        storyCount={edition.items.length}
      />
      <ol className="list-none columns-1 gap-6 p-0 md:columns-3">
        {edition.items.map((item) => (
          <li key={item.article.id} className="mb-6 break-inside-avoid">
            <p className="print-kicker text-press">{edition.sectionNames[item.sectionSlug]}</p>
            <h2 className="print-headline">{item.article.headline}</h2>
            <p className="print-body text-ink-soft">{item.article.summary.brief}</p>
            <p className="ui-meta text-ink-muted">{item.article.sourceName}</p>
          </li>
        ))}
      </ol>
      <p className="dateline text-ink-muted">
        {reader ? `Prepared for ${reader} · ` : ''}from {sources} sources
      </p>
      <p className="ui-meta text-ink-muted">Stub page · owner L6</p>
    </main>
  );
}

// 'YYYY-MM-DD' → 'Saturday, 17 October 2026' (dates are written in full on the paper).
function longDate(date: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}
