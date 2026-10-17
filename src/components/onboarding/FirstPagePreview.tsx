'use client';
// The end of onboarding: a live preview of the reader's first front page, then "Build my paper".
// No confetti, no typesetting animation: while the paper is set, the stories become quiet skeleton
// blocks and a dateline status counts up ("Setting today's paper · 8 of 20 stories").
import { Button, Masthead, StoryCard } from '@/components/morrow';
import type { TasteCard } from '@/contracts/profile';
import { buildStatus } from './lib/finish';

export interface FirstPagePreviewProps {
  date: string;
  name: string | null;
  city: string;
  /** null while the cards load. */
  cards: TasteCard[] | null;
  status: 'idle' | 'building' | 'error';
  built: number;
  onBuild: () => void;
  onBack: () => void;
}

const STORY_COUNT = 20;
const PREVIEW_STORIES = 5;

function SkeletonStory({ lead = false }: { lead?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {lead ? <div className="mb-2 aspect-[3/2] w-full bg-paper-sunk" /> : null}
      <div className={`${lead ? 'h-7' : 'h-5'} w-11/12 bg-paper-sunk`} />
      <div className="h-3 w-full bg-paper-sunk" />
      <div className="h-3 w-full bg-paper-sunk" />
      <div className="h-3 w-2/3 bg-paper-sunk" />
    </div>
  );
}

export function FirstPagePreview({ date, name, city, cards, status, built, onBuild, onBack }: FirstPagePreviewProps) {
  const stories = (cards ?? []).filter((c) => !c.wildcard).slice(0, PREVIEW_STORIES);
  const [lead, ...briefs] = stories;
  const building = status === 'building';
  const showSkeleton = cards === null || building;

  return (
    <div className="flex flex-col gap-6">
      <Masthead date={date} reader={name ?? undefined} location={city} edition={1} storyCount={STORY_COUNT} />
      <h2 id="mw-ob-title" className="dateline text-ink-muted">
        A preview of your first front page
      </h2>

      {showSkeleton ? (
        <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
          <SkeletonStory lead />
          <div className="flex flex-col gap-6 sm:border-l sm:border-rule sm:pl-6">
            <SkeletonStory />
            <SkeletonStory />
            <SkeletonStory />
          </div>
        </div>
      ) : lead ? (
        <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
          <StoryCard variant="standard" kicker={lead.topicName} headline={lead.headline} source={lead.sourceName} imageUrl={lead.imageUrl ?? undefined} />
          {briefs.length > 0 ? (
            <div className="flex flex-col gap-5 sm:border-l sm:border-rule sm:pl-6">
              {briefs.map((c) => (
                <StoryCard key={c.articleId} variant="brief" kicker={c.topicName} headline={c.headline} source={c.sourceName} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="ui-text text-ink-soft">Your first stories are chosen when you build your paper.</p>
      )}

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        {status === 'error' ? (
          <p role="alert" className="ui-text rounded-control bg-press-soft px-3 py-2 text-press">
            Your paper couldn&apos;t be set. Check your connection and try again.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" icon="arrow-left" disabled={building} onClick={onBack}>
            Back
          </Button>
          <Button variant="primary" size="lg" iconRight="arrow-right" disabled={building} onClick={onBuild}>
            {status === 'error' ? 'Try again' : 'Build my paper'}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="dateline text-ink-muted">
          {building ? buildStatus(built, STORY_COUNT) : ''}
        </p>
      </div>
    </div>
  );
}

export default FirstPagePreview;
