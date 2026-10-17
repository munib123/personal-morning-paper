'use client';

import { useState, type ReactNode } from 'react';
import { Button, SectionHeader } from '@/components/morrow';
import { LearningViewSchema, ROUTES } from '@/contracts/api';
import type { LearningView } from '@/contracts/learning';
import { ChangeSummary } from './ChangeSummary';
import { MoversList } from './MoversList';
import { SignalTimeline } from './SignalTimeline';

export interface LearnedTabProps {
  initial: LearningView | null;
  nowIso: string;
  /** Rendered last (the fast-forward simulation, Task 11). */
  after?: ReactNode;
}

const LEARNING_URL = `${ROUTES.learning}?since=7`;

/** "Your paper learned": the change summary, what moved, and the signals behind it. */
export function LearnedTab({ initial, nowIso, after }: LearnedTabProps) {
  const [view, setView] = useState<LearningView | null>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const retry = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(LEARNING_URL, { cache: 'no-store' });
      const parsed = LearningViewSchema.safeParse(res.ok ? await res.json() : null);
      if (!parsed.success) throw new Error('learning view');
      setView(parsed.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (!view) {
    return (
      <div className="flex max-w-(--measure) flex-col gap-4" aria-busy={loading}>
        {loading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <div className="h-6 w-4/5 bg-paper-sunk" />
            <div className="h-4 w-3/5 bg-paper-sunk" />
            <div className="h-4 w-2/3 bg-paper-sunk" />
          </div>
        ) : (
          <p className="ui-text text-ink-soft" aria-live="polite">
            {failed ? "Still couldn't load your learning. Try again in a moment." : "Couldn't load your learning just now."}
          </p>
        )}
        <div>
          <Button variant="secondary" onClick={retry} disabled={loading}>
            {loading ? 'Loading…' : 'Try again'}
          </Button>
        </div>
      </div>
    );
  }

  const empty = view.movers.length === 0 && view.timeline.length === 0;
  return (
    <div className="flex flex-col gap-10">
      <ChangeSummary summary={view.changeSummary} sinceDate={view.sinceDate} />
      {empty ? (
        <p className="ui-text text-ink-muted">Read a few stories and your paper starts adjusting.</p>
      ) : (
        <>
          {view.movers.length > 0 ? (
            <section className="flex flex-col">
              <SectionHeader title="What moved" meta="this week" />
              <MoversList movers={view.movers} />
            </section>
          ) : null}
          {view.timeline.length > 0 ? (
            <section className="flex flex-col">
              <SectionHeader title="What you did" meta="and what it changed" />
              <SignalTimeline timeline={view.timeline} nowIso={nowIso} />
            </section>
          ) : null}
        </>
      )}
      {after}
    </div>
  );
}

export default LearnedTab;
