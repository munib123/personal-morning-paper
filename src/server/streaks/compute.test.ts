import { describe, expect, it } from 'vitest';
import { computeStreak, INITIAL_FREEZE, type DayRecord, type FreezeState } from './compute';

const T = '2026-10-17';

/** One qualifying 'read' row per day from `from` to `to` (inclusive, both in October 2026). */
function reads(from: string, to: string): DayRecord[] {
  const rows: DayRecord[] = [];
  for (let day = Number(from.slice(8)); day <= Number(to.slice(8)); day++) {
    rows.push({ date: `2026-10-${String(day).padStart(2, '0')}`, status: 'read', qualifyingReads: 1, storiesRead: 1, editionComplete: false });
  }
  return rows;
}

describe('computeStreak', () => {
  it('new reader', () => {
    const { view, lastStreakDate } = computeStreak([], T);
    expect(view.state).toBe('new');
    expect(view.current).toBe(0);
    expect(view.freezesAvailable).toBe(1);
    expect(view.todayStoriesRead).toBe(0);
    expect(view.editionComplete).toBe(false);
    expect(view.last7).toHaveLength(7);
    expect(view.last7[0].date).toBe('2026-10-11');
    expect(view.last7[6]).toEqual({ date: '2026-10-17', status: 'today' });
    expect(lastStreakDate).toBeNull();
  });

  it('read today only', () => {
    const { view, lastStreakDate } = computeStreak(reads('2026-10-17', '2026-10-17'), T);
    expect(view.state).toBe('done_today');
    expect(view.current).toBe(1);
    expect(view.totalDays).toBe(1);
    expect(view.milestone).toBeNull();
    expect(view.todayQualified).toBe(true);
    expect(view.todayStoriesRead).toBe(1);
    expect(view.editionComplete).toBe(false);
    expect(view.last7[6]).toEqual({ date: T, status: 'read' });
    expect(lastStreakDate).toBe(T);

    const complete = computeStreak([{ ...reads(T, T)[0], editionComplete: true }], T);
    expect(complete.view.editionComplete).toBe(true);
  });

  it('pending before 20:00', () => {
    const { view } = computeStreak(reads('2026-10-15', '2026-10-16'), T, 10);
    expect(view.state).toBe('pending');
    expect(view.current).toBe(2);
    expect(view.todayQualified).toBe(false);
    expect(view.last7[6].status).toBe('today');
    expect(view.last7[5].status).toBe('read');
  });

  it('at_risk after 20:00 and before 03:00', () => {
    const days = reads('2026-10-15', '2026-10-16');
    expect(computeStreak(days, T, 21).view.state).toBe('at_risk');
    expect(computeStreak(days, T, 20).view.state).toBe('at_risk');
    expect(computeStreak(days, T, 1).view.state).toBe('at_risk');
    expect(computeStreak(days, T, 19).view.state).toBe('pending');
    expect(computeStreak(days, T, 3).view.state).toBe('pending');
    expect(computeStreak(days, T, 21).view.current).toBe(2);
  });

  it('row with zero QRs does not count', () => {
    const { view } = computeStreak([{ date: T, status: 'read', qualifyingReads: 0, storiesRead: 2, editionComplete: false }], T);
    expect(view.state).toBe('new');
    expect(view.current).toBe(0);
    expect(view.todayQualified).toBe(false);
    expect(view.todayStoriesRead).toBe(2);
  });

  it('milestone 3, 7 and none between', () => {
    expect(computeStreak(reads('2026-10-15', '2026-10-17'), T).view.milestone).toBe(3);
    expect(computeStreak(reads('2026-10-11', '2026-10-17'), T).view.milestone).toBe(7);
    expect(computeStreak(reads('2026-10-10', '2026-10-17'), T).view.milestone).toBeNull();
    expect(computeStreak(reads('2026-10-10', '2026-10-16'), T).view.milestone).toBeNull();
  });

  it('auto-applies a freeze', () => {
    const { view, autoFrozen, freeze } = computeStreak(reads('2026-10-10', '2026-10-15'), T, 9);
    expect(view.state).toBe('frozen');
    expect(view.current).toBe(6);
    expect(view.freezesAvailable).toBe(0);
    expect(freeze.available).toBe(0);
    expect(autoFrozen).toEqual(['2026-10-16']);
    expect(view.last7[5]).toEqual({ date: '2026-10-16', status: 'frozen' });
    const persisted = computeStreak([...reads('2026-10-10', '2026-10-15'), { date: '2026-10-16', status: 'frozen', qualifyingReads: 0, storiesRead: 0, editionComplete: false }], T, 9);
    expect(persisted.view).toEqual(view);
    expect(persisted.autoFrozen).toEqual([]);
  });

  it('earns a freeze every 7 days, capped at 2', () => {
    const none: FreezeState = { available: 0, progress: 0, lastRepairDate: null };
    expect(computeStreak(reads('2026-10-11', '2026-10-17'), T, 12, none).view.freezesAvailable).toBe(1);
    expect(computeStreak(reads('2026-10-04', '2026-10-17'), T).view.freezesAvailable).toBe(2);
    expect(INITIAL_FREEZE).toEqual({ available: 1, progress: 0, lastRepairDate: null });
  });

  it('repairable yesterday', () => {
    const none: FreezeState = { available: 0, progress: 0, lastRepairDate: null };
    const held = computeStreak(reads('2026-10-11', '2026-10-15'), T, 12, none);
    expect(held.view.state).toBe('repairable');
    expect(held.view.current).toBe(5);
    expect(held.repairableDate).toBe('2026-10-16');
    const repaired: DayRecord = { date: '2026-10-16', status: 'repaired', qualifyingReads: 0, storiesRead: 0, editionComplete: false };
    const after = computeStreak([...reads('2026-10-11', '2026-10-15'), repaired], T, 12, none);
    expect(after.view).toMatchObject({ state: 'pending', current: 6 });
    expect(after.view.last7[5]).toEqual({ date: '2026-10-16', status: 'repaired' });
    const today = computeStreak([...reads('2026-10-11', '2026-10-15'), repaired, ...reads(T, T)], T, 12, none);
    expect(today.view).toMatchObject({ state: 'done_today', current: 7, milestone: 7, totalDays: 6 });
  });

  it('repairable within 48 h', () => {
    const none: FreezeState = { available: 0, progress: 0, lastRepairDate: null };
    const within = computeStreak([...reads('2026-10-10', '2026-10-14'), ...reads('2026-10-16', '2026-10-16')], T, 12, none);
    expect(within.view).toMatchObject({ state: 'repairable', current: 6 });
    expect(within.repairableDate).toBe('2026-10-15');
    const late = computeStreak([...reads('2026-10-09', '2026-10-13'), ...reads('2026-10-15', '2026-10-16')], T, 12, none);
    expect(late.view).toMatchObject({ state: 'pending', current: 2, longest: 5 });
    expect(late.repairableDate).toBeNull();
  });

  it('repair cooldown 14 days', () => {
    const recent = computeStreak(reads('2026-10-11', '2026-10-15'), T, 12, { available: 0, progress: 0, lastRepairDate: '2026-10-08' });
    expect(recent.view).toMatchObject({ state: 'broken', current: 0, longest: 5 });
    const old = computeStreak(reads('2026-10-11', '2026-10-15'), T, 12, { available: 0, progress: 0, lastRepairDate: '2026-10-02' });
    expect(old.view.state).toBe('repairable');
  });

  it('two misses after the freeze runs out break the streak', () => {
    const { view, autoFrozen } = computeStreak(reads('2026-10-10', '2026-10-13'), T);
    expect(view).toMatchObject({ state: 'broken', current: 0, longest: 4, totalDays: 4 });
    expect(autoFrozen).toEqual(['2026-10-14']);
  });

  it('broken keeps longest and totalDays', () => {
    const { view } = computeStreak([...reads('2026-10-01', '2026-10-10'), ...reads(T, T)], T);
    expect(view.state).toBe('done_today');
    expect(view.current).toBe(1);
    expect(view.longest).toBe(10);
    expect(view.totalDays).toBe(11);
    expect(view.freezesAvailable).toBe(0);
  });

  it('ignores future rows and input order', () => {
    const base = reads('2026-10-15', '2026-10-16');
    const noisy = [...reads('2026-10-18', '2026-10-19'), ...[...base].reverse()];
    expect(computeStreak(noisy, T, 10)).toEqual(computeStreak(base, T, 10));
    expect(computeStreak(noisy, T, 10).view.current).toBe(2);
  });

  it('duplicate rows for one date merge instead of double counting', () => {
    const day = { date: T, status: 'read' as const, qualifyingReads: 0, storiesRead: 3, editionComplete: false };
    const { view } = computeStreak([day, { ...day, qualifyingReads: 2, storiesRead: 1, editionComplete: true }], T);
    expect(view.state).toBe('done_today');
    expect(view.totalDays).toBe(1);
    expect(view.todayStoriesRead).toBe(3);
    expect(view.editionComplete).toBe(true);
  });
});
