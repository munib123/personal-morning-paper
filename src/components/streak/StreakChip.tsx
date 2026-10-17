'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROUTES, StreakResponseSchema } from '@/contracts/api';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { chipLabel, chipParts } from './copy';
import { useLiveStreak } from './live';
import { AtRiskNote } from './AtRiskNote';
import { KeptToast } from './KeptToast';
import { MilestoneToast } from './MilestoneToast';
import { useHideStreak } from './prefs';
import { StreakSheet } from './StreakSheet';
import { TodayMark, todayMark } from './TodayMark';

export interface StreakChipProps {
  streak?: StreakView;
}

// A 44 px header control in the ghost-button manner (paper-sunk on hover, focus ring): today's mark,
// the number in news type, a dateline label, and a short note when the streak needs a read. Under
// 640 px the label shortens ("8 days") so the header fits at 390 px. No flame, emoji or badge.
const CHIP =
  'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-control border-0 bg-transparent px-2 text-ink outline-none transition-colors duration-150 hover:bg-paper-sunk focus-visible:shadow-(--focus-ring) motion-reduce:transition-none sm:gap-2 sm:px-3';

// It opens the streak sheet. Without a `streak` prop (the reader shell) it fetches /api/me/streak
// (the streak and the 12-week heatmap) on mount and again on each open; the live channel keeps the
// number current in between, and a read that keeps today's streak gets one quiet note.
export function StreakChip({ streak }: StreakChipProps) {
  const [fetched, setFetched] = useState<StreakView | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[] | null>(null);
  const [open, setOpen] = useState(false);
  const v = useLiveStreak(streak ?? fetched);
  const [hidden] = useHideStreak(); // the reader can hide the streak in Streak & settings

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (streak) return;
      fetch(ROUTES.streak, { cache: 'no-store', signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: unknown) => {
          const parsed = StreakResponseSchema.safeParse(json);
          if (!parsed.success) return;
          setFetched(parsed.data.streak);
          setHeatmap(parsed.data.heatmap);
        })
        .catch(() => undefined); // signed out or offline: the chip stays hidden, the sheet keeps what it had
    },
    [streak],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  if (!v || hidden) return null;
  const parts = chipParts(v);
  const mark = todayMark(v);
  const quiet = v.state === 'broken';
  return (
    <>
      <button
        type="button"
        className={CHIP}
        aria-label={chipLabel(v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={v.state}
        data-today={mark}
        onClick={() => {
          setOpen(true);
          load(); // fresh heatmap and counts for the sheet
        }}
      >
        <TodayMark mark={mark} className={parts.value === null || quiet ? 'hidden shrink-0 sm:block' : 'shrink-0'} />
        {parts.value !== null ? <span className={`headline-sm tabular-nums ${quiet ? 'text-ink-muted' : 'text-ink'}`}>{parts.value}</span> : null}
        <span className={`dateline whitespace-nowrap sm:hidden ${parts.value === null ? 'text-ink' : 'text-ink-muted'}`}>{parts.short}</span>
        <span className={`dateline hidden whitespace-nowrap sm:inline ${parts.value === null ? 'text-ink' : 'text-ink-muted'}`}>{parts.label}</span>
        {parts.note ? <span className="dateline hidden whitespace-nowrap text-ink md:inline">· {parts.note}</span> : null}
      </button>
      <StreakSheet open={open} onOpenChange={setOpen} streak={v} heatmap={heatmap} />
      <MilestoneToast streak={v} />
      <KeptToast streak={v} />
      <AtRiskNote streak={v} />
    </>
  );
}

export default StreakChip;
