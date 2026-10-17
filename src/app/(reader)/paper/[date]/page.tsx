import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { EditionReader } from '@/components/paper/EditionReader';
import { VIEW_COOKIE, isEditionDate, resolveView } from '@/components/paper/view-pref';
import { firstName } from '@/components/story/format';
import { ROUTES } from '@/contracts/api';
import { getSessionUser } from '@/server/auth/session';
import { getEdition } from '@/server/edition';
import { getProfile } from '@/server/profile';
import { getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';

export const metadata: Metadata = { title: 'Past edition' };

// A past edition exactly as published, read-only (no skip, no Morning Recall). Its "time ago" labels
// are measured from when that paper was made, not from today.
export default async function PaperPage({ params }: PageProps<'/paper/[date]'>) {
  const { date } = await params;
  if (!isEditionDate(date)) notFound();
  const user = await getSessionUser();
  if (!user) redirect(ROUTES.start);
  const profile = await getProfile(user.userId);
  if (!profile) redirect(ROUTES.start);
  const edition = await getEdition(user.userId, date);
  if (!edition) notFound();

  const now = await requestNow();
  const streak = await getStreak(user.userId, now, profile.tz);
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const initialView = resolveView(cookieStore.get(VIEW_COOKIE)?.value, h.get('user-agent'), h.get('sec-ch-ua-mobile'));

  return (
    <EditionReader
      edition={edition}
      nowIso={edition.createdAt}
      initialView={initialView}
      streak={streak}
      readOnly
      readerName={firstName(profile.displayName)}
      city={profile.city}
    />
  );
}
