// Pure streak engine (ARCHITECTURE §10.7). It replays every daily_activity row on each call, so the
// `streaks` table is only a rebuildable cache. No clock reads: callers pass `today` (the reader's local
// date, 03:00 rollover) and the local hour. Freezes and repair (Task 15): a freeze is earned every 7
// streak days (start 1, hold at most 2) and covers a missed day automatically; with no freeze left, one
// missed day within 48 h can be repaired by answering yesterday's recall, at most once per 14 days.
// Kept free of `@/server/time` (next/headers) so client code can import MILESTONES.
import type { DayStatus, StreakState, StreakView } from '@/contracts/streak';

export const MILESTONES = [3, 7, 14, 30, 50, 100] as const;
export const FREEZE_RULES = { start: 1, max: 2, earnEvery: 7, repairWindowDays: 2, repairCooldownDays: 14 } as const;

/** One daily_activity row. */
export interface DayRecord {
  date: string;
  status: 'read' | 'frozen' | 'repaired';
  qualifyingReads: number;
  storiesRead: number;
  editionComplete: boolean;
}

/** Freeze bookkeeping at the start of the replayed history (and, in the result, at its end). */
export interface FreezeState {
  available: number;
  progress: number; // streak days towards the next freeze
  lastRepairDate: string | null;
}

export const INITIAL_FREEZE: FreezeState = { available: FREEZE_RULES.start, progress: 0, lastRepairDate: null };

export interface StreakComputation {
  view: StreakView;
  /** The last local date ≤ today with a qualifying read, or null. */
  lastStreakDate: string | null;
  freeze: FreezeState;
  /** Missed days a freeze covered in this replay that have no stored 'frozen' row yet. */
  autoFrozen: string[];
  /** The missed day a recall answer would repair now, or null. */
  repairableDate: string | null;
}

const AT_RISK_FROM_HOUR = 20;
const ROLLOVER_HOUR = 3; // 00:00–02:59 still belongs to the previous edition day (and is at risk)
const DEFAULT_HOUR = 12;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' plus n days, in UTC (dates only, so no timezone can shift it). */
function addDaysUtc(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` ('YYYY-MM-DD'). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

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

/** A row that keeps the history going: a qualifying read, or a frozen / repaired day. */
const counts = (row: DayRecord | undefined): boolean => !!row && (row.status !== 'read' || row.qualifyingReads >= 1);
const isRead = (row: DayRecord | undefined): boolean => !!row && row.status === 'read' && row.qualifyingReads >= 1;

export function computeStreak(days: DayRecord[], today: string, localHour: number = DEFAULT_HOUR, freeze: FreezeState = INITIAL_FREEZE): StreakComputation {
  const byDate = mergeByDate(days, today);
  const todayRow = byDate.get(today);
  const todayQualified = isRead(todayRow);

  let first: string | null = null;
  for (const [date, row] of byDate) if (counts(row) && (first === null || date < first)) first = date;

  const f: FreezeState = { ...freeze };
  const earn = () => {
    if (f.progress >= FREEZE_RULES.earnEvery) {
      f.progress = 0;
      f.available = Math.min(FREEZE_RULES.max, f.available + 1);
    }
  };
  const autoFrozen: string[] = [];
  let repairable: string | null = null;
  let run = 0;
  let longest = 0;
  let total = 0;
  let lastStreakDate: string | null = null;

  if (first !== null) {
    for (let d = first; d < today; d = addDaysUtc(d, 1)) {
      const row = byDate.get(d);
      if (row?.status === 'repaired') {
        run += 1;
        f.progress += 1;
        f.lastRepairDate = d;
      } else if (isRead(row)) {
        run += 1;
        total += 1;
        f.progress += 1;
        lastStreakDate = d;
      } else if (row?.status === 'frozen') {
        f.available = Math.max(0, f.available - 1); // holds, +0
      } else if (run === 0) {
        f.progress = 0;
      } else if (repairable !== null) {
        run = 0; // a second miss while one is still open
        f.progress = 0;
        repairable = null;
      } else if (f.available > 0) {
        f.available -= 1; // holds, +0
        autoFrozen.push(d);
      } else if (
        daysBetween(d, today) <= FREEZE_RULES.repairWindowDays &&
        (f.lastRepairDate === null || daysBetween(f.lastRepairDate, d) >= FREEZE_RULES.repairCooldownDays)
      ) {
        repairable = d; // the run is held until it is repaired or the window passes
      } else {
        run = 0;
        f.progress = 0;
      }
      earn();
      longest = Math.max(longest, run);
    }
    if (todayQualified) {
      run += 1;
      total += 1;
      f.progress += 1;
      lastStreakDate = today;
      earn();
      longest = Math.max(longest, run);
    }
  }

  const yesterday = addDaysUtc(today, -1);
  const yesterdayFrozen = byDate.get(yesterday)?.status === 'frozen' || autoFrozen.includes(yesterday);

  let state: StreakState;
  if (first === null) state = 'new';
  else if (repairable !== null) state = 'repairable';
  else if (todayQualified) state = 'done_today';
  else if (run > 0) state = localHour >= AT_RISK_FROM_HOUR || localHour < ROLLOVER_HOUR ? 'at_risk' : yesterdayFrozen ? 'frozen' : 'pending';
  else state = 'broken';

  const current = run;
  const milestone = state === 'done_today' && (MILESTONES as readonly number[]).includes(current) ? current : null;

  const last7 = Array.from({ length: 7 }, (_, i): { date: string; status: DayStatus } => {
    const date = addDaysUtc(today, i - 6);
    const row = byDate.get(date);
    if (date === today && !todayQualified) return { date, status: 'today' };
    if (row?.status === 'repaired') return { date, status: 'repaired' };
    if (row?.status === 'frozen' || autoFrozen.includes(date)) return { date, status: 'frozen' };
    return { date, status: isRead(row) ? 'read' : 'missed' };
  });

  return {
    view: {
      state,
      current,
      longest,
      totalDays: total,
      freezesAvailable: f.available,
      todayQualified,
      todayStoriesRead: todayRow?.storiesRead ?? 0,
      editionComplete: todayRow?.editionComplete ?? false,
      milestone,
      last7,
    },
    lastStreakDate,
    freeze: f,
    autoFrozen,
    repairableDate: repairable,
  };
}
