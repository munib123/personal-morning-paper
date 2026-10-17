// / (L5): the landing page is one hero, the paper's own masthead, and one thing to do.
// Static, regenerated every 10 minutes so the date on the nameplate stays current. It reads the real
// clock on purpose: no cookies here (that would make the page dynamic), and the demo clock only
// matters inside the reader.
import Link from 'next/link';
import { Button, Masthead } from '@/components/morrow';
import { longDate } from '@/components/onboarding/lib/dates';
import { ROUTES } from '@/contracts/api';
import { BRAND } from '@/lib/brand';
import { localDate } from '@/server/time';

export const revalidate = 600;

const SAMPLE_PDF = '/demo/sample.pdf';
const PAPER_TZ = 'Asia/Karachi';

export default function LandingPage() {
  const date = longDate(localDate(new Date(), PAPER_TZ));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-(--page-max) flex-col gap-10 bg-paper px-4 py-8 md:px-6 md:py-16">
      <Masthead title={BRAND.nameplate} date={date} tagline="Every morning" />
      <section aria-label="Get your paper" className="mx-auto flex w-full max-w-(--measure) flex-col items-center gap-6 text-center">
        <p className="deck text-ink-soft">{BRAND.tagline}.</p>
        <p className="ui-text text-ink-muted">Takes about a minute to set up. No account needed.</p>
        <Button variant="primary" size="lg" iconRight="arrow-right" href={ROUTES.start}>
          Build my paper
        </Button>
        {/* Pen (links) sits on an inner span: Morrow's unlayered `a { color: inherit }` outranks
            Tailwind's layered text-* utilities on the <a> itself (reported to L0 in docs/handoff/L5.md). */}
        <div className="flex flex-wrap items-center justify-center gap-x-8">
          <Link href={ROUTES.demo} prefetch={false} className="ui-text inline-block py-3">
            <span className="text-pen underline underline-offset-4">Try the demo reader</span>
          </Link>
          <Link href={SAMPLE_PDF} prefetch={false} target="_blank" rel="noopener noreferrer" className="ui-text inline-block py-3">
            <span className="text-pen underline underline-offset-4">See a sample PDF</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
