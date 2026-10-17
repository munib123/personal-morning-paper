// Streak storage behind one interface: Supabase (admin client, server only) and an in-memory twin
// with the same semantics for tests and scripts. daily_activity is the source of truth; the streaks
// row is a cache that computeStreak can always rebuild.
import { createSupabaseAdminClient } from '@/server/db/admin';
import type { SignalType } from '@/contracts/signals';
import type { DayEvent, DaySummary } from './activity';
import type { DayRecord, StreakComputation } from './compute';

export interface StreakRepo {
  loadDays(userId: string): Promise<DayRecord[]>; // incl. edition_complete
  loadDayEvents(userId: string, date: string): Promise<DayEvent[]>;
  loadRecallCount(userId: string, date: string): Promise<number>; // editions.recall length for that edition_date
  upsertDay(userId: string, date: string, s: DaySummary & { editionComplete: boolean }): Promise<void>;
  upsertStreakRow(userId: string, c: StreakComputation): Promise<void>; // freezes 0, last_repair_at null in wave 1
}

/** The cached streaks row, as written by upsertStreakRow. */
export interface StreakRow {
  current: number;
  longest: number;
  totalDays: number;
  lastStreakDate: string | null;
  freezesAvailable: number;
  freezeProgress: number;
  lastRepairAt: string | null;
}

const MAX_DAYS = 400;
const MAX_DAY_EVENTS = 2000;

const toStatus = (s: string): DayRecord['status'] => (s === 'frozen' || s === 'repaired' ? s : 'read');

export function streakRowOf(c: StreakComputation): StreakRow {
  return {
    current: c.view.current,
    longest: c.view.longest,
    totalDays: c.view.totalDays,
    lastStreakDate: c.lastStreakDate,
    freezesAvailable: 0,
    freezeProgress: 0,
    lastRepairAt: null,
  };
}

export function supabaseStreakRepo(): StreakRepo {
  const db = () => createSupabaseAdminClient();
  return {
    async loadDays(userId) {
      // Newest first so a long history keeps its most recent 400 days; computeStreak ignores order.
      const { data, error } = await db()
        .from('daily_activity')
        .select('local_date, status, qualifying_reads, stories_read, edition_complete')
        .eq('user_id', userId)
        .order('local_date', { ascending: false })
        .limit(MAX_DAYS);
      if (error) throw new Error(`daily_activity: ${error.message}`);
      return (data ?? []).map((r) => ({
        date: r.local_date,
        status: toStatus(r.status),
        qualifyingReads: r.qualifying_reads,
        storiesRead: r.stories_read,
        editionComplete: r.edition_complete,
      }));
    },

    async loadDayEvents(userId, date) {
      const { data, error } = await db()
        .from('events')
        .select('type, article_id, value, meta')
        .eq('user_id', userId)
        .eq('local_date', date)
        .limit(MAX_DAY_EVENTS);
      if (error) throw new Error(`events: ${error.message}`);
      return (data ?? []).map((r) => ({
        type: r.type as SignalType,
        articleId: r.article_id,
        value: r.value,
        meta: r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta) ? (r.meta as Record<string, unknown>) : {},
      }));
    },

    async loadRecallCount(userId, date) {
      const { data, error } = await db().from('editions').select('recall').eq('user_id', userId).eq('edition_date', date).maybeSingle();
      if (error) throw new Error(`editions: ${error.message}`);
      return Array.isArray(data?.recall) ? data.recall.length : 0;
    },

    async upsertDay(userId, date, s) {
      // status is left out so the insert default ('read') applies and a stored status is kept.
      const { error } = await db().from('daily_activity').upsert(
        {
          user_id: userId,
          local_date: date,
          qualifying_reads: s.qualifyingReads,
          stories_read: s.storiesRead,
          recall_correct: s.recallCorrect,
          recall_total: s.recallTotal,
          edition_complete: s.editionComplete,
        },
        { onConflict: 'user_id,local_date' },
      );
      if (error) throw new Error(`daily_activity upsert: ${error.message}`);
    },

    async upsertStreakRow(userId, c) {
      const row = streakRowOf(c);
      const { error } = await db().from('streaks').upsert(
        {
          user_id: userId,
          current: row.current,
          longest: row.longest,
          total_days: row.totalDays,
          last_streak_date: row.lastStreakDate,
          freezes_available: row.freezesAvailable,
          freeze_progress: row.freezeProgress,
          last_repair_at: row.lastRepairAt,
          updated_at: new Date().toISOString(), // bookkeeping wall-clock time, not streak logic
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(`streaks upsert: ${error.message}`);
    },
  };
}

export type MemoryStreakRepo = StreakRepo & {
  days: DayRecord[];
  events: Record<string, DayEvent[]>;
  recallCount: number;
  streakRow: StreakRow | null;
};

/** In-memory StreakRepo with the Supabase semantics (one row per date; upserts replace the counts). */
export function memoryStreakRepo(seed?: { days?: DayRecord[]; events?: Record<string, DayEvent[]>; recallCount?: number }): MemoryStreakRepo {
  const repo: MemoryStreakRepo = {
    days: (seed?.days ?? []).map((d) => ({ ...d })),
    events: Object.fromEntries(Object.entries(seed?.events ?? {}).map(([k, v]) => [k, [...v]])),
    recallCount: seed?.recallCount ?? 0,
    streakRow: null,
    async loadDays() {
      return repo.days.map((d) => ({ ...d }));
    },
    async loadDayEvents(_userId, date) {
      return [...(repo.events[date] ?? [])];
    },
    async loadRecallCount() {
      return repo.recallCount;
    },
    async upsertDay(_userId, date, s) {
      const i = repo.days.findIndex((d) => d.date === date);
      const row: DayRecord = {
        date,
        status: i >= 0 ? repo.days[i].status : 'read',
        qualifyingReads: s.qualifyingReads,
        storiesRead: s.storiesRead,
        editionComplete: s.editionComplete,
      };
      if (i >= 0) repo.days[i] = row;
      else repo.days.push(row);
    },
    async upsertStreakRow(_userId, c) {
      repo.streakRow = streakRowOf(c);
    },
  };
  return repo;
}
