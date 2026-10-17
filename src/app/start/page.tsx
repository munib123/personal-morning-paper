'use client';
// STUB (L0) — owner: L5. Replace freely; keep the route.
import { useState } from 'react';
import { InterestPicker } from '@/components/onboarding/InterestPicker';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { InterestPick } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';

const MIN_PICKS = 3;

export default function StartPage() {
  const [value, setValue] = useState<{ picks: InterestPick[]; blocked: TopicSlug[] }>({ picks: [], blocked: [] });
  const missing = Math.max(0, MIN_PICKS - value.picks.length);
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-col gap-6 px-4 py-8 md:px-6 md:py-16">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p className="dateline text-ink-muted">Step 2 of 4</p>
        <h1 className="headline-lg">What should your paper cover?</h1>
        <p className="ui-text text-ink-soft">Pick at least three topics. You can change these any time.</p>
      </header>
      <section className="flex flex-col gap-6">
        {/* The picker labels its groups with h3s; this keeps the heading outline in order. */}
        <h2 className="sr-only">Topics</h2>
        <InterestPicker taxonomy={FIXTURE_TAXONOMY} value={value} onChange={setValue} mode="onboarding" />
      </section>
      <p className="ui-meta text-ink-muted" aria-live="polite">
        {missing > 0 ? `Pick ${missing} more` : `${value.picks.length} topics picked`}
      </p>
      <p className="ui-meta text-ink-muted">Stub page · owner L5</p>
    </main>
  );
}
