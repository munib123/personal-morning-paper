// /me/preview (owner L7): the L7 engagement components on fixtures, for screenshots and the keyboard
// pass. Only in development or with DEMO_MODE=1.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/morrow';
import { DoneForToday } from '@/components/recall/DoneForToday';
import { MorningRecallCard } from '@/components/recall/MorningRecallCard';
import { StreakChip } from '@/components/streak/StreakChip';
import { StreakPanel } from '@/components/streak/StreakPanel';
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import { SheetPreview } from './SheetPreview';

export const metadata: Metadata = { title: 'Engagement preview' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The first three fixture stories that carry a recall question, as if read today (most dwell first).
const DONE_READ_IDS = FIXTURE_EDITION.items
  .filter((i) => i.article.recall !== null)
  .slice(0, 3)
  .map((i) => i.article.id);

export default async function PreviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.DEMO_MODE !== '1' && process.env.NODE_ENV === 'production') notFound();
  const sp = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-2">
        <p className="dateline text-ink-muted">Preview · fixtures</p>
        <h1 className="headline-lg text-ink">Streak, recall and end of paper</h1>
      </header>
      <section className="flex flex-col gap-3">
        <SectionHeader title="Streak line" />
        <div>
          <StreakChip streak={FIXTURE_STREAK} />
        </div>
      </section>
      <section className="flex max-w-(--measure) flex-col gap-3">
        <SectionHeader title="Streak panel" />
        <StreakPanel streak={FIXTURE_STREAK} />
      </section>
      <section className="flex max-w-(--measure) flex-col gap-3" id="recall">
        <SectionHeader title="Morning recall" />
        <MorningRecallCard questions={FIXTURE_EDITION.recall} editionId={`preview-${FIXTURE_EDITION.id}`} />
      </section>
      <section className="flex max-w-(--measure) flex-col gap-3" id="done">
        <SectionHeader title="End of paper" />
        <DoneForToday edition={{ ...FIXTURE_EDITION, id: `preview-done-${FIXTURE_EDITION.id}` }} readIds={DONE_READ_IDS} streak={FIXTURE_STREAK} />
      </section>
      {sp.open === 'sheet' ? <SheetPreview streak={FIXTURE_STREAK} /> : null}
    </div>
  );
}
