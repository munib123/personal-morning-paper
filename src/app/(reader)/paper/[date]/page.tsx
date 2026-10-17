// STUB (L0) — owner: L4. Replace freely; keep the route.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button, Masthead, SectionHeader, StoryCard } from '@/components/morrow';
import { PdfButton } from '@/components/pdf/PdfButton';
import { WhyChip } from '@/components/story/WhyChip';
import { ROUTES } from '@/contracts/api';
import type { Edition, EditionItem } from '@/contracts/edition';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { BRAND } from '@/lib/brand';
import { getEdition } from '@/server/edition';
import { getProfile } from '@/server/profile';

export const metadata: Metadata = { title: 'Past edition' };

// A past edition, read-only, exactly as published. Real version (L4): session + profile, then the EditionReader
// with readOnly. Stub: the fixture reader; only the fixture date exists, anything else is a 404.
export default async function PaperPage({ params }: PageProps<'/paper/[date]'>) {
  const { date } = await params;
  const edition = await getEdition(FIXTURE_USER_ID, date);
  if (!edition) notFound();
  const profile = await getProfile(FIXTURE_USER_ID);
  const [lead, ...rest] = edition.items;

  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <Masthead
        title={BRAND.nameplate}
        date={longDate(edition.date)}
        edition={edition.number}
        reader={firstName(profile?.displayName)}
        storyCount={edition.items.length}
        actions={<PdfButton date={edition.date} editionId={edition.id} />}
      />
      <p className="body-sm max-w-(--measure) text-ink-soft">{edition.editorNote}</p>

      <section className="flex flex-col gap-6">
        <h2 className="sr-only">Lead story</h2>
        {lead ? <Story item={lead} edition={edition} variant="lead" /> : null}
      </section>

      <section>
        <SectionHeader title="In this edition" meta={`${rest.length} more stories`} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((item) => (
            <Story key={item.article.id} item={item} edition={edition} variant="standard" />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" icon="archive" href={ROUTES.archive}>
          Past editions
        </Button>
      </div>
      <p className="ui-meta text-ink-muted">Stub page · owner L4</p>
    </div>
  );
}

function Story({ item, edition, variant }: { item: EditionItem; edition: Edition; variant: 'lead' | 'standard' }) {
  const { article } = item;
  return (
    <StoryCard
      variant={variant}
      kicker={edition.sectionNames[item.sectionSlug]}
      headline={article.headline}
      deck={variant === 'lead' ? (article.whyItMatters ?? undefined) : undefined}
      summary={article.summary[item.tier]}
      source={article.sourceName}
      readingTime={`${article.readingMinutes} min read`}
      imageUrl={article.imageUrl ?? undefined}
      href={ROUTES.outbound(article.id, 'web', edition.id)}
      footer={<WhyChip reasons={item.reasons} breakdown={item.breakdown} />}
    />
  );
}

function firstName(displayName: string | null | undefined): string | undefined {
  return displayName?.trim().split(/\s+/)[0] || undefined;
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
