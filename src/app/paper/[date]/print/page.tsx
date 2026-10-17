// /paper/[date]/print: the printed paper as a page, outside the reader shell, always in the Morning theme.
// It is the fallback when no stored PDF exists (Vercel) and prints to PDF from the browser's own dialog.
// The app already serves the Morrow CSS and fonts, so nothing is inlined here.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PrintButton } from '@/components/print/PrintButton';
import { PrintEdition } from '@/components/print/PrintEdition';
import type { Edition } from '@/contracts/edition';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { getSessionUser } from '@/server/auth/session';
import { getEdition } from '@/server/edition';
import { isPaperDate, wantsFixture } from '@/server/pdf/access';
import { fixtureExtras } from '@/server/pdf/fixture';
import { preparePrintModel } from '@/server/pdf/model';
import type { PrintExtras } from '@/server/pdf/types';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Print edition' };

export default async function PrintPage({ params, searchParams }: PageProps<'/paper/[date]/print'>) {
  const { date } = await params;
  if (!isPaperDate(date)) notFound();

  let edition: Edition;
  let extras: PrintExtras;
  if (wantsFixture((await searchParams).fixture)) {
    edition = FIXTURE_EDITION;
    extras = fixtureExtras();
  } else {
    const user = await getSessionUser();
    if (!user) redirect('/start');
    const profile = await getProfile(user.userId);
    if (!profile) redirect('/start');
    const found = await getEdition(user.userId, date);
    if (!found) notFound();
    edition = found;
    extras = fixtureExtras();
  }

  const model = await preparePrintModel(edition, extras);
  return (
    <div data-theme="morning" lang="en" className="print-shell">
      <PrintButton />
      <PrintEdition model={model} />
    </div>
  );
}
