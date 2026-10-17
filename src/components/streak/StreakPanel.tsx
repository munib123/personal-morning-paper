'use client';

import { ReadingProgress } from '@/components/morrow';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { HOW_IT_WORKS, goalLine, goalProgress, heroStat, highestMilestone, milestoneLine, sheetHeadline, statsLine } from './copy';
import { useLiveStreak } from './live';
import { ReadingHeatmap } from './ReadingHeatmap';
import { StreakStrip } from './StreakStrip';

export interface StreakPanelProps {
  streak: StreakView;
  /** The 12-week reading heatmap, drawn below the stats when given (the sheet and the /me streak tab). */
  heatmap?: HeatmapDay[] | null;
}

const STORIES_FOR_COMPLETE = 5;

function progressLabel(v: StreakView): string {
  if (v.editionComplete) return "Today's paper is complete";
  const read = Math.min(v.todayStoriesRead, STORIES_FOR_COMPLETE);
  if (v.todayStoriesRead >= STORIES_FOR_COMPLETE) return `${read} of ${STORIES_FOR_COMPLETE} stories today · Morning Recall left`;
  return `${read} of ${STORIES_FOR_COMPLETE} stories today`;
}

/**
 * The streak in full: the big number (news type) with its label and one stats line, the 7-day strip
 * with today named, today's goal (1 story keeps it) and today's paper, freezes in one line, and the
 * 12-week heatmap when given. A new reader gets how it works instead of a zero.
 */
export function StreakPanel({ streak, heatmap }: StreakPanelProps) {
  const v = useLiveStreak(streak) ?? streak;
  const hero = heroStat(v);
  const stats = statsLine(v);
  const reached = highestMilestone(v.current);
  const line = reached === null ? null : milestoneLine(reached);
  return (
    <div className="flex flex-col gap-6">
      {hero ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="headline-xl m-0 tabular-nums text-ink">{hero.value}</p>
            <p className="dateline m-0 text-ink-muted">{hero.label}</p>
          </div>
          {v.state === 'broken' ? null : <p className="deck m-0 text-ink-soft">{sheetHeadline(v)}</p>}
          {stats ? <p className="ui-meta m-0 text-ink-muted">{stats}</p> : null}
          {line ? <p className="body-sm m-0 text-ink-soft">{line}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="headline-md m-0 text-ink">How your streak works</p>
          {HOW_IT_WORKS.map((l) => (
            <p key={l} className="ui-text m-0 text-ink-soft">
              {l}
            </p>
          ))}
        </div>
      )}
      <StreakStrip last7={v.last7} size="lg" />
      <section aria-label="Today's goal" className="flex flex-col gap-3 border-t border-rule pt-4">
        <div className="flex flex-col gap-1">
          <p className="dateline m-0 text-ink-muted">Today&apos;s goal</p>
          <p className="ui-label m-0 text-ink" aria-live="polite">
            {goalLine(v)}
          </p>
        </div>
        <ReadingProgress value={v.todayQualified ? 1 : 0} label={goalProgress(v)} />
        <ReadingProgress value={Math.min(v.todayStoriesRead / STORIES_FOR_COMPLETE, 1)} label={progressLabel(v)} />
        <p className="ui-meta m-0 text-ink-muted">
          Freezes held: {v.freezesAvailable}. They cover a missed day automatically; you earn one every 7 days (max 2).
        </p>
      </section>
      {heatmap && heatmap.length > 0 ? (
        <section aria-label="Your reading, last 12 weeks" className="flex flex-col gap-3 border-t border-rule pt-4">
          <p className="dateline m-0 text-ink-muted">Last 12 weeks</p>
          <ReadingHeatmap days={heatmap} />
        </section>
      ) : null}
    </div>
  );
}

export default StreakPanel;
