// /start (L5): onboarding. A reader who is already onboarded goes straight to today's paper (§9.7).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { longDate } from '@/components/onboarding/lib/dates';
import { ROUTES } from '@/contracts/api';
import { getSessionUser } from '@/server/auth/session';
import { getTaxonomy } from '@/server/onboarding';
import { getProfile } from '@/server/profile';
import { localDate, requestNow } from '@/server/time';

// The root layout's title template adds " · Morrow".
export const metadata: Metadata = { title: 'Build your paper' };

const PAPER_TZ = 'Asia/Karachi';

async function isOnboarded(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  try {
    return Boolean((await getProfile(user.userId))?.onboardedAt);
  } catch {
    return false; // profile lookup failed: let them (re)build their paper rather than bounce
  }
}

export default async function StartPage({ searchParams }: PageProps<'/start'>) {
  if (await isOnboarded()) redirect(ROUTES.today);
  const [taxonomy, params, now] = await Promise.all([getTaxonomy(), searchParams, requestNow()]);
  return <OnboardingFlow taxonomy={taxonomy} date={longDate(localDate(now, PAPER_TZ))} demoUnavailable={params.demo === 'unavailable'} />;
}
