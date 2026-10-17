'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/morrow';
import { ROUTES, StreakResponseSchema } from '@/contracts/api';
import type { StreakView } from '@/contracts/streak';
import { chipLabel, chipText } from './copy';
import { useLiveStreak } from './live';
import { AtRiskNote } from './AtRiskNote';
import { MilestoneToast } from './MilestoneToast';
import { useHideStreak } from './prefs';
import { StreakSheet } from './StreakSheet';

export interface StreakChipProps {
  streak?: StreakView;
}

// The quiet streak line ("6-DAY STREAK": .dateline sets the caps) in a ghost Button with a 44 px
// target. No flame, emoji, badge or animation. It opens the streak sheet. Without a `streak` prop
// (the L0 TopBar) it fetches /api/me/streak once; the live channel keeps it current after that.
export function StreakChip({ streak }: StreakChipProps) {
  const [fetched, setFetched] = useState<StreakView | null>(null);
  const [open, setOpen] = useState(false);
  const v = useLiveStreak(streak ?? fetched);
  const [hidden] = useHideStreak(); // the reader can hide the streak in Streak & settings

  useEffect(() => {
    if (streak) return;
    const ctrl = new AbortController();
    fetch(ROUTES.streak, { cache: 'no-store', signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        const parsed = StreakResponseSchema.safeParse(json);
        if (parsed.success) setFetched(parsed.data.streak);
      })
      .catch(() => undefined); // signed out or offline: the chip stays hidden
    return () => ctrl.abort();
  }, [streak]);

  if (!v || hidden) return null;
  return (
    <>
      <Button variant="ghost" aria-label={chipLabel(v)} aria-haspopup="dialog" aria-expanded={open} data-state={v.state} onClick={() => setOpen(true)}>
        <span className="dateline">{chipText(v)}</span>
      </Button>
      <StreakSheet open={open} onOpenChange={setOpen} streak={v} />
      <MilestoneToast streak={v} />
      <AtRiskNote streak={v} />
    </>
  );
}

export default StreakChip;
