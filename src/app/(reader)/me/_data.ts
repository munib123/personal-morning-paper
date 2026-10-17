// Server-side data for /me (owner L7). Pages use getSessionUser + getProfile and redirect('/start')
// (§9.7). `?fixtures=1` serves the contract fixtures (outside production, or with DEMO_MODE=1).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { MeData } from '@/components/learning/me-tabs';
import { FIXTURE_LEARNING, FIXTURE_PROFILE, FIXTURE_STREAK, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { getSessionUser } from '@/server/auth/session';
import { getLearningView } from '@/server/learn';
import { getTaxonomy } from '@/server/onboarding';
import { getProfile } from '@/server/profile';
import { getStreak } from '@/server/streaks';
import { nextMorningIso } from '@/server/streaks/clock';
import { requestNow } from '@/server/time';

type SearchParams = Record<string, string | string[] | undefined>;

const LEARNING_DAYS = 7;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** True when `?fixtures=1` may be honoured: always in development, only with DEMO_MODE=1 in production. */
export function fixturesAllowed(sp: SearchParams): boolean {
  if (first(sp.fixtures) !== '1') return false;
  return process.env.DEMO_MODE === '1' || process.env.NODE_ENV !== 'production';
}

async function demoClock(demoMode: boolean): Promise<string | null> {
  if (!demoMode) return null;
  try {
    const raw = (await cookies()).get('subah_now')?.value;
    return raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  } catch {
    return null;
  }
}

export async function loadMeData(sp: SearchParams): Promise<MeData> {
  const demoMode = process.env.DEMO_MODE === '1';
  const now = await requestNow();
  const clockIso = await demoClock(demoMode);

  if (fixturesAllowed(sp)) {
    return {
      profile: FIXTURE_PROFILE,
      streak: FIXTURE_STREAK,
      learning: FIXTURE_LEARNING,
      taxonomy: FIXTURE_TAXONOMY,
      demoMode,
      nextMorning: nextMorningIso(now, FIXTURE_PROFILE.tz),
      clockIso,
      fixtures: true,
    };
  }

  const user = await getSessionUser();
  if (!user) redirect('/start');
  const profile = await getProfile(user.userId);
  if (!profile) redirect('/start');

  const [streak, learning, taxonomy] = await Promise.all([
    getStreak(user.userId, now, profile.tz),
    getLearningView(user.userId, LEARNING_DAYS, now).catch((err: unknown) => {
      console.error('[me] getLearningView failed', err);
      return null;
    }),
    getTaxonomy().catch(() => FIXTURE_TAXONOMY),
  ]);
  return { profile, streak, learning, taxonomy, demoMode, nextMorning: nextMorningIso(now, profile.tz), clockIso, fixtures: false };
}
