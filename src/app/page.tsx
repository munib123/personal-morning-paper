// / (L5, polished): the landing page is the paper's own front page. The masthead and the promise with one
// thing to do, then a live preview of today's biggest stories, how it works, and what makes it different.
// Static, regenerated every 10 minutes so the date and the headlines stay current. It reads the real
// clock on purpose: no cookies here (that would make the page dynamic), and the demo clock only
// matters inside the reader.
import { Button, Masthead } from '@/components/morrow';
import { loadFrontPage } from '@/components/landing/headlines';
import { FrontPagePreview, HowItWorks, LandingFooter, WhatsDifferent } from '@/components/landing/LandingSections';
import { longDate } from '@/components/onboarding/lib/dates';
import { ROUTES } from '@/contracts/api';
import { BRAND } from '@/lib/brand';
import { localDate } from '@/server/time';

export const revalidate = 600;

const PAPER_TZ = 'Asia/Karachi';

export default async function LandingPage() {
  const now = new Date();
  const date = longDate(localDate(now, PAPER_TZ));
  const page = await loadFrontPage(now);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-(--page-max) flex-col gap-12 bg-paper px-4 pt-6 pb-10 md:gap-16 md:px-6 md:pt-10">
      <div className="flex flex-col">
        {/* Two strip items only: a third wraps at 390 px and starts the second line with a stray "·". */}
        <Masthead title={BRAND.nameplate} date={date} tagline="Every morning" reader="you" storyCount={20} />
        <section aria-label="Get your paper" className="mx-auto flex w-full max-w-(--measure) flex-col items-center gap-5 pt-10 text-center md:pt-14">
          <h2 className="headline-lg text-balance text-ink">{BRAND.tagline}.</h2>
          <p className="deck text-ink-soft">
            Morrow reads more than a hundred sources overnight and sets the twenty stories that matter to you, as a front page
            on the web and a newspaper PDF. The more you read, the better it fits.
          </p>
          <div className="mt-2 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <Button variant="primary" size="lg" iconRight="arrow-right" href={ROUTES.start}>
              Build my paper
            </Button>
            <Button variant="secondary" size="lg" href={ROUTES.demo}>
              Read the demo paper
            </Button>
          </div>
          <p className="ui-meta text-ink-muted">Takes about a minute. No account needed.</p>
        </section>
      </div>
      <FrontPagePreview page={page} />
      <HowItWorks />
      <WhatsDifferent />
      <section aria-label="Start your paper" className="mx-auto flex w-full max-w-(--measure) flex-col items-center gap-4 text-center">
        <p className="headline-md text-balance text-ink">Tomorrow&rsquo;s paper can be yours.</p>
        <Button variant="primary" size="lg" iconRight="arrow-right" href={ROUTES.start}>
          Build my paper
        </Button>
      </section>
      <LandingFooter />
    </main>
  );
}
