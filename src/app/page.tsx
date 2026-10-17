// STUB (L0) — owner: L5. Replace freely; keep the route.
import { Button, Masthead } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import { BRAND } from '@/lib/brand';
import { localDate, requestNow } from '@/server/time';

const SAMPLE_PDF = '/demo/sample.pdf';

export default async function LandingPage() {
  const today = localDate(await requestNow(), 'Asia/Karachi');
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6 md:py-16">
      <Masthead title={BRAND.nameplate} date={longDate(today)} />
      <section className="flex max-w-(--measure) flex-col gap-6" aria-label="Get your paper">
        <p className="deck text-ink-soft">{BRAND.tagline}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="accent" size="lg" iconRight="arrow-right" href={ROUTES.start}>
            Build my paper
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <a className="ui-text text-pen underline underline-offset-4" href={ROUTES.demo}>
            Try the demo reader
          </a>
          <a className="ui-text text-pen underline underline-offset-4" href={SAMPLE_PDF}>
            See a sample PDF
          </a>
        </div>
      </section>
      <p className="ui-meta text-ink-muted">Stub page · owner L5</p>
    </main>
  );
}

// 'YYYY-MM-DD' → 'Saturday, 17 October 2026' (dates are written in full on the paper).
function longDate(date: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}
