import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { EditionReader } from '@/components/paper/EditionReader';
import { PaperLoading } from '@/components/paper/PaperStates';
import { VIEW_COOKIE, resolveView } from '@/components/paper/view-pref';
import { firstName } from '@/components/story/format';
import { ROUTES } from '@/contracts/api';
import type { Profile } from '@/contracts/profile';
import { getSessionUser } from '@/server/auth/session';
import { buildEdition } from '@/server/edition';
import { getProfile } from '@/server/profile';
import { getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';

export const metadata: Metadata = { title: 'Today' };

// Today's edition. No session or no profile → onboarding (a real 307: decided before anything
// streams). The edition is built on first open (the editor's note lands after the response), so
// only that part streams in behind Morrow skeletons.
export default async function TodayPage() {
  const user = await getSessionUser();
  if (!user) redirect(ROUTES.start);
  const profile = await getProfile(user.userId);
  if (!profile) redirect(ROUTES.start);

  return (
    <Suspense fallback={<PaperLoading />}>
      <TodayEdition userId={user.userId} profile={profile} />
    </Suspense>
  );
}

async function TodayEdition({ userId, profile }: { userId: string; profile: Profile }) {
  const now = await requestNow();
  const edition = await buildEdition(userId, now);
  const streak = await getStreak(userId, now, profile.tz);
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const initialView = resolveView(cookieStore.get(VIEW_COOKIE)?.value, h.get('user-agent'), h.get('sec-ch-ua-mobile'));

  return (
    <EditionReader
      edition={edition}
      nowIso={now.toISOString()}
      initialView={initialView}
      streak={streak}
      readOnly={false}
      readerName={firstName(profile.displayName)}
      city={profile.city}
    />
  );
}
