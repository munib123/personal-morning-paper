// /archive (owner L7): every past paper as published, grouped by week, with the last 7 mornings.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArchiveCalendar } from '@/components/archive/ArchiveCalendar';
import { Button } from '@/components/morrow';
import { StreakStrip } from '@/components/streak/StreakStrip';
import type { ArchiveEntry } from '@/contracts/edition';
import { FIXTURE_ARCHIVE, FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { getSessionUser } from '@/server/auth/session';
import { listArchive } from '@/server/edition';
import { getProfile } from '@/server/profile';
import { getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';
import { fixturesAllowed } from '../me/_data';

export const metadata: Metadata = { title: 'Past editions' };
export const dynamic = 'force-dynamic';

const ARCHIVE_LIMIT = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function load(sp: Record<string, string | string[] | undefined>): Promise<{ entries: ArchiveEntry[]; streak: StreakView }> {
  if (fixturesAllowed(sp)) return { entries: FIXTURE_ARCHIVE, streak: FIXTURE_STREAK };
  const user = await getSessionUser();
  if (!user) redirect('/start');
  const profile = await getProfile(user.userId);
  if (!profile) redirect('/start');
  const now = await requestNow();
  const [entries, streak] = await Promise.all([
    listArchive(user.userId, ARCHIVE_LIMIT).catch((err: unknown) => {
      console.error('[archive] listArchive failed', err);
      return [] as ArchiveEntry[];
    }),
    getStreak(user.userId, now, profile.tz),
  ]);
  return { entries, streak };
}

export default async function ArchivePage({ searchParams }: { searchParams: SearchParams }) {
  const { entries, streak } = await load(await searchParams);
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p className="dateline text-ink-muted">{entries.length === 1 ? '1 edition' : `${entries.length} editions`}</p>
        <h1 className="headline-lg text-ink">Past editions</h1>
        <p className="ui-text text-ink-soft">Every paper exactly as it was published, newest first.</p>
        <div className="mt-1">
          <Button size="sm" variant="secondary" icon="bookmark" href="/saved">
            Saved stories
          </Button>
        </div>
      </header>
      <section aria-label="Your last 7 mornings" className="flex flex-col gap-2">
        <StreakStrip last7={streak.last7} />
        <p className="ui-meta text-ink-muted">Your last 7 mornings</p>
      </section>
      <ArchiveCalendar entries={entries} />
    </div>
  );
}
