import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreakResponseSchema } from '@/contracts/api';
import { FIXTURE_HEATMAP, FIXTURE_PROFILE, FIXTURE_STREAK } from '@/contracts/fixtures';

const session = vi.hoisted(() => ({ user: null as { userId: string; isAnonymous: boolean } | null }));
const calls = vi.hoisted(() => ({ streak: [] as unknown[][], heatmap: [] as unknown[][] }));

vi.mock('@/server/auth/session', () => ({
  requireUser: async () => {
    if (!session.user) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    return session.user;
  },
}));
vi.mock('@/server/profile', () => ({ getProfile: async () => ({ ...FIXTURE_PROFILE, tz: 'Asia/Kolkata' }) }));
vi.mock('@/server/time', () => ({ requestNow: async () => new Date('2026-10-17T05:00:00Z') }));
vi.mock('@/server/streaks', () => ({
  getStreak: async (...args: unknown[]) => {
    calls.streak.push(args);
    return FIXTURE_STREAK;
  },
  getHeatmap: async (...args: unknown[]) => {
    calls.heatmap.push(args);
    return FIXTURE_HEATMAP;
  },
}));

import { GET } from './route';

beforeEach(() => {
  session.user = null;
  calls.streak = [];
  calls.heatmap = [];
});

describe('GET /api/me/streak', () => {
  it('401 without a session', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the streak and an 84-day heatmap in the reader timezone', async () => {
    session.user = { userId: 'u-l7', isAnonymous: true };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = StreakResponseSchema.parse(await res.json());
    expect(body.heatmap).toHaveLength(84);
    expect(calls.streak[0]).toEqual(['u-l7', new Date('2026-10-17T05:00:00Z'), 'Asia/Kolkata']);
    expect(calls.heatmap[0]).toEqual(['u-l7', 84, new Date('2026-10-17T05:00:00Z'), 'Asia/Kolkata']);
  });
});
