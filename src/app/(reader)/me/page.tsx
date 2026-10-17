// /me (owner L7): what your paper learned, your interests, and your streak and settings.
import type { Metadata } from 'next';
import { MeTabs } from '@/components/learning/MeTabs';
import { parseMeTab } from '@/components/learning/me-tabs';
import { loadMeData } from './_data';

export const metadata: Metadata = { title: 'Your paper' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await loadMeData(sp);
  const first = data.profile.displayName?.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p className="dateline text-ink-muted">{first ? `Prepared for ${first}` : data.profile.paperName}</p>
        <h1 className="headline-lg text-ink">Your paper</h1>
        <p className="ui-text text-ink-soft">What your paper has learned from your reading, and how to change it.</p>
      </header>
      <MeTabs initialTab={parseMeTab(sp.tab)} data={data} />
    </div>
  );
}
