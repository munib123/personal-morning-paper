'use client';

import { ReadingProgress } from '@/components/morrow';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { highestMilestone, milestoneLine } from './copy';
import { useLiveStreak } from './live';
import { ReadingHeatmap } from './ReadingHeatmap';
import { StreakStrip } from './StreakStrip';

export interface StreakPanelProps {
  streak: StreakView;
  /** The 12-week reading heatmap, drawn below the stats when given (the /me streak tab). */
  heatmap?: HeatmapDay[] | null;
}

const STORIES_FOR_COMPLETE = 5;

function progressLabel(v: StreakView): string {
  if (v.editionComplete) return "Today's paper is complete";
  const read = Math.min(v.todayStoriesRead, STORIES_FOR_COMPLETE);
  if (v.todayStoriesRead >= STORIES_FOR_COMPLETE) return `${read} of ${STORIES_FOR_COMPLETE} stories today · Morning Recall left`;
  return `${read} of ${STORIES_FOR_COMPLETE} stories today`;
}

/** The streak's quiet detail: 7-day strip, one stats line, the milestone line and today's paper. */
export function StreakPanel({ streak, heatmap }: StreakPanelProps) {
  const v = useLiveStreak(streak) ?? streak;
  const reached = highestMilestone(v.current);
  const line = reached === null ? null : milestoneLine(reached);
  return (
    <div className="flex flex-col gap-4">
      <StreakStrip last7={v.last7} />
      <p className="ui-meta text-ink-muted">
        Current {v.current} · Longest {v.longest} · {v.totalDays === 1 ? '1 reading day' : `${v.totalDays} reading days`}
      </p>
      {heatmap && heatmap.length > 0 ? <ReadingHeatmap days={heatmap} /> : null}
      {line ? <p className="body-sm text-ink-soft">{line}</p> : null}
      <ReadingProgress value={Math.min(v.todayStoriesRead / STORIES_FOR_COMPLETE, 1)} label={progressLabel(v)} />
    </div>
  );
}

export default StreakPanel;
