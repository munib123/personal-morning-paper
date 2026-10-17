import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeightDelta } from '@/contracts/signals';
import { FIXTURE_EDITION, FIXTURE_LEARNING, FIXTURE_PROFILE } from '@/contracts/fixtures';
import { getLearningView } from '@/server/learn';
import { getProfile } from '@/server/profile';
import { loadPrintExtras } from './extras';
import { APP_URL } from './fixture';

vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }));
vi.mock('@/server/learn', () => ({ getLearningView: vi.fn() }));

const NOW = new Date('2026-10-17T02:00:00.000Z');
const mover = (n: number): WeightDelta => ({ slug: `t.${n}`, name: `Topic ${n}`, before: 0.4, after: 0.5 });

beforeEach(() => {
  vi.mocked(getProfile).mockReset().mockResolvedValue(FIXTURE_PROFILE);
  vi.mocked(getLearningView).mockReset().mockResolvedValue(FIXTURE_LEARNING);
});

describe('loadPrintExtras', () => {
  it('asks for the last 7 days of learning at the request time', async () => {
    await loadPrintExtras(FIXTURE_EDITION, NOW);
    expect(getLearningView).toHaveBeenCalledWith(FIXTURE_EDITION.userId, 7, NOW);
    expect(getProfile).toHaveBeenCalledWith(FIXTURE_EDITION.userId);
  });

  it('keeps the top 5 movers and the reader’s city and name', async () => {
    vi.mocked(getLearningView).mockResolvedValue({ ...FIXTURE_LEARNING, movers: [1, 2, 3, 4, 5, 6, 7].map(mover) });
    const extras = await loadPrintExtras(FIXTURE_EDITION, NOW);
    expect(extras.movers.map((m) => m.slug)).toEqual(['t.1', 't.2', 't.3', 't.4', 't.5']);
    expect(extras.city).toBe(FIXTURE_PROFILE.city);
    expect(extras.displayName).toBe(FIXTURE_PROFILE.displayName);
    expect(extras.appUrl).toBe(APP_URL);
  });

  it('prints for "you" in Islamabad when there is no profile', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const extras = await loadPrintExtras(FIXTURE_EDITION, NOW);
    expect(extras.city).toBe('Islamabad');
    expect(extras.displayName).toBeNull();
  });

  it('prints without movers when the learning view fails', async () => {
    vi.mocked(getLearningView).mockRejectedValue(new Error('db down'));
    vi.mocked(getProfile).mockRejectedValue(new Error('db down'));
    const extras = await loadPrintExtras(FIXTURE_EDITION, NOW);
    expect(extras.movers).toEqual([]);
    expect(extras.city).toBe('Islamabad');
  });

  it('never carries a streak', async () => {
    expect('streak' in (await loadPrintExtras(FIXTURE_EDITION, NOW))).toBe(false);
  });
});
