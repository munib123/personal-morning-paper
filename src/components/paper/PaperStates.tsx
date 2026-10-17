'use client';
// The paper's two in-between states (design README "Motion and states", "Voice and copy"): while it
// is being set, skeleton blocks in paper-sunk shaped like headlines and text, with a dateline status;
// when it could not be set, what happened and what to do next. No spinner, no apology.
import { useEffect } from 'react';
import { Button } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import { BRAND } from '@/lib/brand';

export function PaperLoading() {
  return (
    <div className="mx-auto w-full max-w-(--page-max) px-4 pt-6 pb-16 md:px-6" aria-busy="true">
      <p role="status" className="dateline text-center text-ink-muted">
        Setting today&apos;s paper
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <div data-skeleton className="h-12 w-64 max-w-full bg-paper-sunk" />
        <div data-skeleton className="h-3 w-full bg-paper-sunk" />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          <div data-skeleton className="aspect-[3/2] w-full bg-paper-sunk" />
          <div data-skeleton className="h-9 w-4/5 bg-paper-sunk" />
          <div data-skeleton className="h-4 w-full bg-paper-sunk" />
          <div data-skeleton className="h-4 w-11/12 bg-paper-sunk" />
        </div>
        <div className="flex flex-col gap-3">
          <div data-skeleton className="h-5 w-1/2 bg-paper-sunk" />
          <div data-skeleton className="h-16 w-full bg-paper-sunk" />
          <div data-skeleton className="h-16 w-full bg-paper-sunk" />
          <div data-skeleton className="h-16 w-full bg-paper-sunk" />
        </div>
      </div>
    </div>
  );
}

/** Next 16 `error.tsx` props: `retry()` re-fetches and re-renders the segment. */
export function PaperError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[paper] could not render the edition', error);
  }, [error]);
  return (
    <div className="mx-auto flex w-full max-w-(--measure) flex-col items-start gap-4 px-4 pt-16 pb-16">
      <p className="masthead-sm text-ink">{BRAND.nameplate}</p>
      <h1 className="headline-lg text-ink">Your paper couldn&apos;t be set just now.</h1>
      <p className="ui-text text-ink-soft">
        Nothing you read is lost. Try again in a moment; your past editions are still on the shelf.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
        <Button variant="secondary" icon="archive" href={ROUTES.archive}>
          Past editions
        </Button>
      </div>
    </div>
  );
}
