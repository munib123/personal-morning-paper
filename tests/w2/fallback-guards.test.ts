// DEMO_FALLBACK=1 (W2-shipkit integration): every read the reader pages make is served from
// public/demo/snapshot.json, and nothing touches the network. fetch rejects, so any Supabase call fails.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionUser } from '@/server/auth/session';
import { loadSnapshot, snapshotPersonaId } from '@/server/demo';
import { buildEdition, getEdition, listArchive } from '@/server/edition';
import { getLearningView, processSignals } from '@/server/learn';
import { getTaxonomy } from '@/server/onboarding/taxonomy';
import { getProfile } from '@/server/profile';
import { getHeatmap, getStreak } from '@/server/streaks';

const ANY_USER = '11111111-2222-4333-8444-555555555555';
const NOW = new Date('2026-10-17T04:00:00Z'); // 09:00 PKT

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('DEMO_FALLBACK', '1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('network is off')));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('DEMO_FALLBACK guards', () => {
  it('the session is the persona without asking Supabase', async () => {
    await expect(getSessionUser()).resolves.toEqual({ userId: snapshotPersonaId(), isAnonymous: false });
  });

  it('editions, archive and the profile come from the snapshot for any user id', async () => {
    const latest = loadSnapshot().persona.latestEditionDate;
    expect((await getEdition(ANY_USER, latest))?.date).toBe(latest);
    expect((await buildEdition(ANY_USER, NOW)).items.length).toBeGreaterThan(0);
    expect((await listArchive(ANY_USER, 60)).length).toBeGreaterThan(0);
    expect((await getProfile(ANY_USER))?.userId).toBe(snapshotPersonaId());
  });

  it('streak, heatmap, learning view, signals and the taxonomy answer offline', async () => {
    expect((await getStreak(ANY_USER, NOW, 'Asia/Karachi')).current).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(await getHeatmap(ANY_USER, 84, NOW, 'Asia/Karachi'))).toBe(true);
    expect((await getLearningView(ANY_USER, 7, NOW)).weights.length).toBeGreaterThan(0);
    expect((await processSignals(ANY_USER, [], NOW)).accepted).toBe(0);
    expect((await getTaxonomy()).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
