// Any unknown URL (and notFound() from a page): the paper's own masthead and a way back, in Morrow
// tokens, instead of Next's default white "404 | This page could not be found."
import type { Metadata } from 'next';
import { Button, Masthead } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-(--page-max) flex-col gap-10 bg-paper px-4 py-8 md:px-6 md:py-16">
      <Masthead title={BRAND.nameplate} date="Page not found" tagline="Every morning" />
      <section aria-labelledby="not-found-title" className="mx-auto flex w-full max-w-(--measure) flex-col items-center gap-6 text-center">
        <h2 id="not-found-title" className="headline-lg m-0 text-ink">
          This page is not in any edition
        </h2>
        <p className="deck m-0 text-ink-soft">The link may be old or mistyped. Your paper is where you left it.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" href={ROUTES.today}>
            Today&rsquo;s paper
          </Button>
          <Button variant="secondary" href={ROUTES.archive}>
            Past editions
          </Button>
        </div>
      </section>
    </main>
  );
}
