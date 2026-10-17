// STUB (L0) — owner: L4. Replace freely; keep the route.
import type { Metadata } from 'next';
import { Masthead, SectionHeader, StoryCard, TakeawayBox } from '@/components/morrow';
import { PdfButton } from '@/components/pdf/PdfButton';
import { DoneForToday } from '@/components/recall/DoneForToday';
import { MorningRecallCard } from '@/components/recall/MorningRecallCard';
import { WhyChip } from '@/components/story/WhyChip';
import { ROUTES } from '@/contracts/api';
import type { Edition, EditionItem } from '@/contracts/edition';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { BRAND } from '@/lib/brand';
import { buildEdition } from '@/server/edition';
import { getProfile } from '@/server/profile';
import { getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';

export const metadata: Metadata = { title: 'Today' };

// Real version (L4): getSessionUser() + getProfile() → redirect('/start'), then the EditionReader.
// Stub: the fixture reader and the fixture edition, read-only cards.
export default async function TodayPage() {
  const now = await requestNow();
  const profile = await getProfile(FIXTURE_USER_ID);
  const edition = await buildEdition(FIXTURE_USER_ID, now);
  const streak = await getStreak(FIXTURE_USER_ID, now, profile?.tz ?? 'Asia/Karachi');
  const [lead, ...rest] = edition.items;
  const takeaways = edition.items.slice(0, 3).map((item) => ({
    kicker: edition.sectionNames[item.sectionSlug],
    text: item.article.keyFact ?? item.article.summary.brief,
  }));

  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <Masthead
        title={BRAND.nameplate}
        date={longDate(edition.date)}
        edition={edition.number}
        reader={firstName(profile?.displayName)}
        location={profile?.city}
        storyCount={edition.items.length}
        actions={<PdfButton date={edition.date} editionId={edition.id} />}
      />
      <p className="body-sm max-w-(--measure) text-ink-soft">{edition.editorNote}</p>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <h2 className="sr-only">Top stories</h2>
        {lead ? <Story item={lead} edition={edition} now={now} variant="lead" /> : null}
        <div className="flex flex-col gap-6">
          <MorningRecallCard questions={edition.recall} editionId={edition.id} />
          <TakeawayBox items={takeaways} />
        </div>
      </section>

      <section>
        <SectionHeader title="More from your interests" meta={`${rest.length} stories`} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((item) => (
            <Story key={item.article.id} item={item} edition={edition} now={now} variant="standard" />
          ))}
        </div>
      </section>

      <DoneForToday edition={edition} readIds={[]} streak={streak} />
      <p className="ui-meta text-ink-muted">Stub page · owner L4</p>
    </div>
  );
}

function Story({ item, edition, now, variant }: { item: EditionItem; edition: Edition; now: Date; variant: 'lead' | 'standard' }) {
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
      published={timeAgo(article.publishedAt, now)}
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

// '5h ago' style (story meta); undefined when the timestamp is unusable.
function timeAgo(iso: string, now: Date): string | undefined {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return undefined;
  const minutes = Math.max(1, Math.round((now.getTime() - at) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
