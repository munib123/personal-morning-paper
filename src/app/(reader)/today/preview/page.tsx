import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { EditionReader } from '@/components/paper/EditionReader';
import { VIEW_COOKIE, resolveView, type ReaderView } from '@/components/paper/view-pref';
import { firstName } from '@/components/story/format';
import { FIXTURE_EDITION, FIXTURE_PROFILE, FIXTURE_STREAK } from '@/contracts/fixtures';

export const metadata: Metadata = { title: 'Preview' };

// DEMO_MODE only: the fixture edition with no sign-in, for browser checks and the demo fallback.
// ?view=front|bytes picks the view; otherwise the reader's cookie or device decides.
export default async function TodayPreviewPage({ searchParams }: PageProps<'/today/preview'>) {
  if (process.env.DEMO_MODE !== '1') notFound();
  const { view } = await searchParams;
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const initialView: ReaderView =
    view === 'front' || view === 'bytes'
      ? view
      : resolveView(cookieStore.get(VIEW_COOKIE)?.value, h.get('user-agent'), h.get('sec-ch-ua-mobile'));

  return (
    <EditionReader
      edition={FIXTURE_EDITION}
      nowIso={FIXTURE_EDITION.createdAt}
      initialView={initialView}
      streak={FIXTURE_STREAK}
      readOnly={false}
      readerName={firstName(FIXTURE_PROFILE.displayName)}
      city={FIXTURE_PROFILE.city}
    />
  );
}
