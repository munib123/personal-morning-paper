import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { SignalEvent } from '@/contracts/signals';
import { toDayEvent } from './activity';
import type { DayRecord } from './compute';
import { getHeatmapWith, getStreakWith, recordActivityWith } from './index';
import { memoryStreakRepo, type StreakRepo } from './repo';

const TZ = 'Asia/Karachi';
const MORNING = new Date('2026-10-17T05:00:00Z'); // 10:00 PKT, edition day 2026-10-17
const U = 'user-l7-test';

const readEvents: SignalEvent[] = [
  { type: 'open', articleId: 'a1', meta: { mode: 'sheet' } },
  { type: 'dwell', articleId: 'a1', value: 25000, meta: { mode: 'sheet' } },
];

function reads(from: number, to: number): DayRecord[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    date: `2026-10-${String(from + i).padStart(2, '0')}`,
    status: 'read' as const,
    qualifyingReads: 1,
    storiesRead: 1,
    editionComplete: false,
  }));
}

/** What L3's processSignals does before calling recordActivity: store the batch under its local date. */
function insertLikeL3(repo: ReturnType<typeof memoryStreakRepo>, date: string, events: SignalEvent[]) {
  repo.events[date] = [...(repo.events[date] ?? []), ...events.map(toDayEvent)];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('recordActivityWith', () => {
  it('first QR of the day lights the streak', async () => {
    const repo = memoryStreakRepo();
    const view = await recordActivityWith(repo, U, readEvents, MORNING, TZ);
    expect(view).toMatchObject({ state: 'done_today', current: 1, todayStoriesRead: 1, todayQualified: true });
    expect(repo.days.find((d) => d.date === '2026-10-17')).toMatchObject({ qualifyingReads: 1, storiesRead: 1 });
    expect(repo.streakRow).toMatchObject({ current: 1, longest: 1, totalDays: 1, lastStreakDate: '2026-10-17', freezesAvailable: 0 });
  });

  it('02:30 PKT counts for the previous day', async () => {
    const repo = memoryStreakRepo();
    await recordActivityWith(repo, U, readEvents, new Date('2026-10-17T21:30:00Z'), TZ);
    expect(repo.days.map((d) => d.date)).toEqual(['2026-10-17']);
  });

  it('same batch twice does not inflate', async () => {
    const repo = memoryStreakRepo();
    insertLikeL3(repo, '2026-10-17', readEvents);
    await recordActivityWith(repo, U, readEvents, MORNING, TZ);
    insertLikeL3(repo, '2026-10-17', readEvents);
    const view = await recordActivityWith(repo, U, readEvents, MORNING, TZ);
    expect(repo.days).toHaveLength(1);
    expect(repo.days[0]).toMatchObject({ qualifyingReads: 1, storiesRead: 1 });
    expect(view.todayStoriesRead).toBe(1);
  });

  it('counts events stored earlier in the day together with the new batch', async () => {
    const repo = memoryStreakRepo({ events: { '2026-10-17': [toDayEvent({ type: 'open', articleId: 'a1', meta: { mode: 'sheet' } })] } });
    const view = await recordActivityWith(repo, U, [{ type: 'dwell', articleId: 'a1', value: 21000, meta: { mode: 'sheet' } }], MORNING, TZ);
    expect(view.state).toBe('done_today');
  });

  it('milestone only on the transition', async () => {
    const repo = memoryStreakRepo({ days: reads(15, 16) });
    const first = await recordActivityWith(repo, U, readEvents, MORNING, TZ);
    expect(first).toMatchObject({ state: 'done_today', current: 3, milestone: 3 });
    insertLikeL3(repo, '2026-10-17', readEvents);
    const second = await recordActivityWith(repo, U, [{ type: 'read_original', articleId: 'a2', meta: { src: 'web' } }], MORNING, TZ);
    expect(second).toMatchObject({ current: 3, milestone: null });
  });

  it('edition complete needs 5 reads and the recall', async () => {
    const opens: SignalEvent[] = ['a1', 'a2', 'a3', 'a4', 'a5'].map((articleId) => ({ type: 'open', articleId, meta: { mode: 'sheet' } }));
    const answer = (articleId: string): SignalEvent => ({ type: 'recall_answer', articleId, value: 1, meta: { chosen: 0 } });

    const all = memoryStreakRepo({ recallCount: 3 });
    const view = await recordActivityWith(all, U, [...opens, answer('r1'), answer('r2'), answer('r3')], MORNING, TZ);
    expect(all.days[0].editionComplete).toBe(true);
    expect(view).toMatchObject({ editionComplete: true, todayStoriesRead: 5 });

    const partial = memoryStreakRepo({ recallCount: 3 });
    await recordActivityWith(partial, U, [...opens, answer('r1'), answer('r2')], MORNING, TZ);
    expect(partial.days[0].editionComplete).toBe(false);

    const dayOne = memoryStreakRepo({ recallCount: 0 });
    const v1 = await recordActivityWith(dayOne, U, opens, MORNING, TZ);
    expect(dayOne.days[0].editionComplete).toBe(true);
    expect(v1.editionComplete).toBe(true);
  });

  it('a batch with no reading signal writes nothing', async () => {
    const repo = memoryStreakRepo({ days: reads(15, 16) });
    const upsert = vi.spyOn(repo, 'upsertDay');
    const view = await recordActivityWith(repo, U, [{ type: 'impression', articleId: 'a1', meta: { slot: 'lead' } }], MORNING, TZ);
    expect(upsert).not.toHaveBeenCalled();
    expect(view).toMatchObject({ state: 'pending', current: 2, milestone: null });
  });

  it('repo failure returns a fallback, never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: StreakRepo = { ...memoryStreakRepo(), loadDays: () => Promise.reject(new Error('supabase down')) };
    const view = await recordActivityWith(broken, U, readEvents, MORNING, TZ);
    expect(view).toMatchObject({ state: 'new', current: 0, freezesAvailable: 0, todayStoriesRead: 0, editionComplete: false, milestone: null });
    expect(view.last7).toHaveLength(7);

    vi.stubEnv('DEMO_FALLBACK', '1');
    expect(await recordActivityWith(broken, U, readEvents, MORNING, TZ)).toEqual(FIXTURE_STREAK);
  });
});

describe('getStreakWith / getHeatmapWith', () => {
  it('reads the streak without a milestone', async () => {
    const repo = memoryStreakRepo({ days: reads(15, 17) });
    expect(await getStreakWith(repo, U, MORNING, TZ)).toMatchObject({ state: 'done_today', current: 3, milestone: null });
  });

  it('is at risk late in the evening', async () => {
    const repo = memoryStreakRepo({ days: reads(15, 16) });
    expect((await getStreakWith(repo, U, new Date('2026-10-17T16:00:00Z'), TZ)).state).toBe('at_risk');
  });

  it('falls back on a repo failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: StreakRepo = { ...memoryStreakRepo(), loadDays: () => Promise.reject(new Error('down')) };
    expect((await getStreakWith(broken, U, MORNING, TZ)).state).toBe('new');
    const heat = await getHeatmapWith(broken, U, 84, MORNING, TZ);
    expect(heat).toHaveLength(84);
    expect(heat.every((d) => d.storiesRead === 0)).toBe(true);
  });

  it('builds the heatmap from daily_activity', async () => {
    const repo = memoryStreakRepo({ days: [{ date: '2026-10-17', status: 'read', qualifyingReads: 2, storiesRead: 5, editionComplete: true }] });
    const heat = await getHeatmapWith(repo, U, 84, MORNING, TZ);
    expect(heat.at(-1)).toEqual({ date: '2026-10-17', storiesRead: 5, level: 3 });
  });
});
