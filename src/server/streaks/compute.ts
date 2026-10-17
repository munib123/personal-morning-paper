// Pure streak engine (ARCHITECTURE §10.7, wave 1). It replays every daily_activity row on each call,
// so the `streaks` table is only a rebuildable cache. No clock reads: callers pass `today` (the
// reader's local date, 03:00 rollover) and the local hour. Wave 1 has no freezes or repair (PLAN §5a):
// a missed day breaks the streak, `freezesAvailable` is always 0, and `frozen` / `repairable` are
// never emitted. Kept free of `@/server/time` (next/headers) so client code can import MILESTONES.
import type { DayStatus, StreakState, StreakView } from '@/contracts/streak';

export const MILESTONES = [3, 7, 14, 30, 50, 100] as const;

/** One daily_activity row. Wave 1 writes only 'read' rows. */
export interface DayRecord {
  date: string;
  status: 'read' | 'frozen' | 'repaired';
  qualifyingReads: number;
  storiesRead: number;
  editionComplete: boolean;
}

export interface StreakComputation {
  view: StreakView;
  /** The last local date ≤ today with a qualifying read, or null. */
  lastStreakDate: string | null;
}

const AT_RISK_FROM_HOUR = 20;
const ROLLOVER_HOUR = 3; // 00:00–02:59 still belongs to the previous edition day (and is at risk)
const DEFAULT_HOUR = 12;

/** 'YYYY-MM-DD' plus n days, in UTC (dates only, so no timezone can shift it). */
function addDaysUtc(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One row per date: the max of the counts, OR of editionComplete; a non-'read' status wins. Future rows dropped. */
function mergeByDate(days: DayRecord[], today: string): Map<string, DayRecord> {
  const byDate = new Map<string, DayRecord>();
  for (const row of days) {
    if (row.date > today) continue; // the demo clock moved backwards: ignore what lies "ahead"
    const prev = byDate.get(row.date);
    byDate.set(
      row.date,
      prev
        ? {
            date: row.date,
            status: prev.status !== 'read' ? prev.status : row.status,
            qualifyingReads: Math.max(prev.qualifyingReads, row.qualifyingReads),
            storiesRead: Math.max(prev.storiesRead, row.storiesRead),
            editionComplete: prev.editionComplete || row.editionComplete,
          }
        : { ...row },
    );
  }
  return byDate;
}

const counts = (row: DayRecord | undefined): boolean => !!row && row.status === 'read' && row.qualifyingReads >= 1;

export function computeStreak(days: DayRecord[], today: string, localHour: number = DEFAULT_HOUR): StreakComputation {
  const byDate = mergeByDate(days, today);
  const todayRow = byDate.get(today);
  const todayQualified = counts(todayRow);

  let first: string | null = null;
  for (const [date, row] of byDate) if (counts(row) && (first === null || date < first)) first = date;

  let run = 0;
  let longest = 0;
  let total = 0;
  let lastStreakDate: string | null = null;
  if (first !== null) {
    for (let d = first; d < today; d = addDaysUtc(d, 1)) {
      if (counts(byDate.get(d))) {
        run += 1;
        total += 1;
        lastStreakDate = d;
      } else {
        run = 0;
      }
      longest = Math.max(longest, run);
    }
    if (todayQualified) {
      run += 1;
      total += 1;
      lastStreakDate = today;
      longest = Math.max(longest, run);
    }
  }

  let state: StreakState;
  if (first === null) state = 'new';
  else if (todayQualified) state = 'done_today';
  else if (run > 0) state = localHour >= AT_RISK_FROM_HOUR || localHour < ROLLOVER_HOUR ? 'at_risk' : 'pending';
  else state = 'broken';

  const current = run;
  const milestone = state === 'done_today' && (MILESTONES as readonly number[]).includes(current) ? current : null;

  const last7 = Array.from({ length: 7 }, (_, i): { date: string; status: DayStatus } => {
    const date = addDaysUtc(today, i - 6);
    if (date === today && !todayQualified) return { date, status: 'today' };
    return { date, status: counts(byDate.get(date)) ? 'read' : 'missed' };
  });

  return {
    view: {
      state,
      current,
      longest,
      totalDays: total,
      freezesAvailable: 0,
      todayQualified,
      todayStoriesRead: todayRow?.storiesRead ?? 0,
      editionComplete: todayRow?.editionComplete ?? false,
      milestone,
      last7,
    },
    lastStreakDate,
  };
}
