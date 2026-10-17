// Streaks (ARCHITECTURE §9.3 / §10.7, owner L7). Thin I/O around the pure computeStreak.
// recordActivity is called by L3's processSignals (after or before it stores the events; the union of
// the stored day and the batch is deduplicated) and must never throw into it.
import type { SignalEvent } from '@/contracts/signals';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { FIXTURE_HEATMAP, FIXTURE_STREAK } from '@/contracts/fixtures';
import { localDate } from '@/server/time';
import { buildHeatmap, READING_TYPES, summarizeDay, toDayEvent } from './activity';
import { localHour } from './clock';
import { computeStreak, type DayRecord } from './compute';
import { supabaseStreakRepo, type StreakRepo } from './repo';

const RECORD_COMPLETE_STORIES = 5;

const demoFallback = () => process.env.DEMO_FALLBACK === '1';

/** A neutral view for when storage fails: a new reader today (or the fixture with DEMO_FALLBACK=1). */
function fallbackView(now: Date, tz: string): StreakView {
  if (demoFallback()) return FIXTURE_STREAK;
  return { ...computeStreak([], localDate(now, tz)).view, freezesAvailable: 0 }; // unknown, so claim none
}

/** Replace today's row in `days` with the freshly upserted one (what loadDays would return now). */
function withDay(days: DayRecord[], row: DayRecord): DayRecord[] {
  return [...days.filter((d) => d.date !== row.date), row];
}

export async function recordActivityWith(repo: StreakRepo, userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView> {
  try {
    const date = localDate(now, tz);
    const hour = localHour(now, tz);
    let days = await repo.loadDays(userId);
    const prior = computeStreak(days, date, hour);
    if (!events.some((e) => READING_TYPES.has(e.type))) return { ...prior.view, milestone: null };

    // Repair: with one missed day still open (no freeze left, within 48 h), a recall answer catches it up.
    let lastRepairAt: string | null = null;
    if (prior.repairableDate && events.some((e) => e.type === 'recall_answer')) {
      await repo.upsertStatusDays(userId, [prior.repairableDate], 'repaired');
      const missed = days.find((d) => d.date === prior.repairableDate);
      days = withDay(days, { date: prior.repairableDate, qualifyingReads: 0, storiesRead: 0, editionComplete: false, ...missed, status: 'repaired' });
      lastRepairAt = now.toISOString();
    }

    const [stored, recallCount] = await Promise.all([repo.loadDayEvents(userId, date), repo.loadRecallCount(userId, date)]);
    const summary = summarizeDay([...stored, ...events.map(toDayEvent)]);
    // A day with no recall questions (day 1) counts as "recall answered".
    const editionComplete = summary.storiesRead >= RECORD_COMPLETE_STORIES && summary.recallTotal >= recallCount;
    await repo.upsertDay(userId, date, { ...summary, editionComplete });

    const existing = days.find((d) => d.date === date);
    const next = computeStreak(
      withDay(days, {
        date,
        status: existing?.status ?? 'read',
        qualifyingReads: summary.qualifyingReads,
        storiesRead: summary.storiesRead,
        editionComplete,
      }),
      date,
      hour,
    );
    await repo.upsertStatusDays(userId, next.autoFrozen, 'frozen');
    await repo.upsertStreakRow(userId, next, lastRepairAt);
    // The milestone is news only on the read that crossed it.
    return { ...next.view, milestone: !prior.view.todayQualified && next.view.todayQualified ? next.view.milestone : null };
  } catch (err) {
    console.error('[streaks] recordActivity failed', err);
    return fallbackView(now, tz);
  }
}

export async function getStreakWith(repo: StreakRepo, userId: string, now: Date, tz: string): Promise<StreakView> {
  try {
    const c = computeStreak(await repo.loadDays(userId), localDate(now, tz), localHour(now, tz));
    if (c.autoFrozen.length > 0) {
      // Keep the covered days on record; a failure here must not hide the streak.
      await repo.upsertStatusDays(userId, c.autoFrozen, 'frozen').catch((err: unknown) => console.error('[streaks] persisting frozen days failed', err));
    }
    return { ...c.view, milestone: null };
  } catch (err) {
    console.error('[streaks] getStreak failed', err);
    return fallbackView(now, tz);
  }
}

export async function getHeatmapWith(repo: StreakRepo, userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]> {
  const today = localDate(now, tz);
  try {
    return buildHeatmap(await repo.loadDays(userId), today, days);
  } catch (err) {
    console.error('[streaks] getHeatmap failed', err);
    return demoFallback() ? FIXTURE_HEATMAP : buildHeatmap([], today, days);
  }
}

// ── §9.3 (exact signatures) ─────────────────────────────────────────────────────────────────────
export function recordActivity(userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView> {
  return recordActivityWith(supabaseStreakRepo(), userId, events, now, tz);
}

export function getStreak(userId: string, now: Date, tz: string): Promise<StreakView> {
  return getStreakWith(supabaseStreakRepo(), userId, now, tz);
}

export function getHeatmap(userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]> {
  return getHeatmapWith(supabaseStreakRepo(), userId, days, now, tz);
}
