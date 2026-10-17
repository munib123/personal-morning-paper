// /saved: every story the reader kept with Save, across editions, newest first. Server-rendered
// from the 'save' events; each card links to the original (through /r) and to the paper it came from.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Button, StoryCard } from '@/components/morrow';
import { formatEditionDate, outboundHref, readingTimeLabel, timeAgo } from '@/components/story/format';
import { ShareButton } from '@/components/story/ShareButton';
import { ROUTES } from '@/contracts/api';
import { getSessionUser } from '@/server/auth/session';
import { getProfile } from '@/server/profile';
import { requestNow } from '@/server/time';
import { fixturesAllowed } from '../me/_data';
import { fixtureSaved, listSavedStories, type SavedStory } from './_data';

export const metadata: Metadata = { title: 'Saved stories' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function load(sp: Record<string, string | string[] | undefined>): Promise<SavedStory[]> {
  if (fixturesAllowed(sp)) return fixtureSaved();
  const user = await getSessionUser();
  if (!user) redirect('/start');
  const profile = await getProfile(user.userId);
  if (!profile) redirect('/start');
  return listSavedStories(user.userId).catch((err: unknown) => {
    console.error('[saved] listSavedStories failed', err);
    return [];
  });
}

export default async function SavedPage({ searchParams }: { searchParams: SearchParams }) {
  const [stories, now] = await Promise.all([searchParams.then(load), requestNow()]);
  const nowIso = now.toISOString();
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p className="dateline text-ink-muted">{stories.length === 1 ? '1 story' : `${stories.length} stories`}</p>
        <h1 className="headline-lg text-ink">Saved stories</h1>
        <p className="ui-text text-ink-soft">Everything you kept with Save, from every edition, newest first.</p>
      </header>
      {stories.length === 0 ? (
        <section aria-label="No saved stories" className="flex max-w-(--measure) flex-col items-start gap-4 border-t border-rule pt-6">
          <p className="deck text-ink-soft">Nothing saved yet. Use Save on any story.</p>
          <Button variant="secondary" href="/today" iconRight="arrow-right">
            Open today&rsquo;s paper
          </Button>
        </section>
      ) : (
        <ol className="grid gap-x-10 border-t border-rule md:grid-cols-2" aria-label="Saved stories">
          {stories.map((s) => {
            const a = s.article;
            // Brief cards carry their own rule below; the list adds the one above.
            return (
              <li key={a.id}>
                <StoryCard
                  variant="brief"
                  kicker={s.section || undefined}
                  headline={a.headline || a.title}
                  summary={a.summary.brief || a.summary.std || undefined}
                  source={a.sourceName}
                  readingTime={readingTimeLabel(a.readingMinutes)}
                  published={timeAgo(a.publishedAt, nowIso) || undefined}
                  href={outboundHref(a.id, s.editionId)}
                  footer={
                    <div className="flex flex-wrap items-center gap-2">
                      {s.editionDate ? (
                        <Button size="sm" variant="ghost" icon="archive" href={ROUTES.paper(s.editionDate)}>
                          {formatEditionDate(s.editionDate)}
                        </Button>
                      ) : null}
                      <ShareButton size="sm" title={a.headline || a.title} url={a.url} />
                    </div>
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
