// Landing page sections (Server Components, no client JS of their own). Morrow components and tokens only.
// Link colour sits on an inner span: Morrow's unlayered `a { color: inherit }` outranks Tailwind's
// layered text-* utilities on the <a> itself (docs/handoff/L5.md).
import Image from 'next/image';
import { SectionHeader, StoryCard } from '@/components/morrow';
import type { FrontPage } from './headlines';
import type { FrontPageStory } from './front-page';

export const REPO_URL = 'https://github.com/munib123/personal-morning-paper';
export const ARCHITECTURE_URL = `${REPO_URL}#architecture`;
export const DEMO_PDF = '/demo/persona-today.pdf';

function storyProps(s: FrontPageStory) {
  return {
    kicker: s.section,
    headline: s.headline,
    href: s.url ?? undefined,
    source: s.sourceName,
    readingTime: s.outlets > 1 ? `Covered by ${s.outlets} outlets` : undefined,
    published: s.ago || undefined,
  };
}

/** "On today's front page": a lead, two stories beside it and a row underneath, like page one. */
export function FrontPagePreview({ page }: { page: FrontPage }) {
  const [lead, ...rest] = page.stories;
  const side = rest.slice(0, 2);
  const row = rest.slice(2, 5);
  const meta = page.origin === 'live' ? 'The biggest stories right now, by how many outlets carry them' : 'From the demo reader’s paper';
  return (
    <section aria-label="On today's front page" className="flex flex-col">
      <SectionHeader title="On today's front page" meta={meta} />
      {lead ? (
        <>
          <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:gap-0">
            <div className="md:border-r md:border-rule md:pr-6">
              <StoryCard variant="lead" {...storyProps(lead)} />
            </div>
            <div className="flex flex-col border-t border-rule md:border-t-0 md:pl-6">
              {side.map((s) => <StoryCard key={s.id} variant="brief" {...storyProps(s)} />)}
            </div>
          </div>
          {row.length > 0 ? (
            <div className="mt-6 grid gap-6 border-t border-rule pt-4 md:grid-cols-3 md:gap-0">
              {row.map((s, i) => (
                <div key={s.id} className={i > 0 ? 'md:border-l md:border-rule md:pl-6' : 'md:pr-6'}>
                  <StoryCard variant="standard" {...storyProps(s)} />
                </div>
              ))}
            </div>
          ) : null}
          <p className="ui-meta mt-6 text-ink-muted">
            Your paper starts from stories like these, then keeps the twenty that fit you. Headlines link to the original.
          </p>
        </>
      ) : (
        <p className="deck text-ink-soft">Today&rsquo;s front page is being set. The demo paper is ready to read in the meantime.</p>
      )}
    </section>
  );
}

const STEPS = [
  {
    title: 'Pick what you care about',
    body: 'Start broad, with areas like Science, Sport or Technical, then go deeper only where you want depth. It takes about a minute.',
  },
  {
    title: 'Get your Top 20 every morning',
    body: 'Twenty stories chosen for you from more than a hundred sources, on the web and as a newspaper PDF with your name on the masthead.',
  },
  {
    title: 'It learns from what you read',
    body: 'Reading, skipping and More or Less all change tomorrow’s paper, and every story says why it is there.',
  },
];

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="flex flex-col">
      <SectionHeader title="How it works" meta="Three steps, one minute" />
      <ol className="grid list-none gap-6 p-0 md:grid-cols-3 md:gap-0">
        {STEPS.map((s, i) => (
          <li key={s.title} className={i > 0 ? 'border-t border-rule pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6' : 'md:pr-6'}>
            <p className="dateline text-ink-muted">Step {i + 1}</p>
            <h3 className="headline-md mt-2 text-ink">{s.title}</h3>
            <p className="body-sm mt-2 text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WhatsDifferent() {
  return (
    <section aria-label="What makes it different" className="flex flex-col">
      <SectionHeader title="What makes it different" />
      <div className="grid gap-8 md:grid-cols-[5fr_7fr] md:gap-0">
        <article className="flex flex-col gap-4 md:border-r md:border-rule md:pr-6">
          <h3 className="headline-md text-ink">A real newspaper PDF</h3>
          <p className="body-sm text-ink-soft">
            The same edition set as an A4 newspaper: a lead with a drop cap, three things to know, an index, and a QR code back
            to every story. A fresh one every morning.
          </p>
          <a href={DEMO_PDF} target="_blank" rel="noopener noreferrer" className="block border border-rule">
            <Image
              src="/landing/front-page.png"
              width={760}
              height={1076}
              unoptimized
              alt="Page 1 of a real edition: the nameplate, a lead story with a photo and drop cap, three things to know, an inside index and a row of teasers"
              className="block h-auto w-full"
            />
          </a>
          <a href={DEMO_PDF} target="_blank" rel="noopener noreferrer" className="ui-text inline-block self-start py-2">
            <span className="text-pen underline underline-offset-4">Open today&rsquo;s demo PDF</span>
          </a>
        </article>
        <div className="flex flex-col md:pl-6">
          <article className="flex flex-col gap-2 border-t border-rule pt-6 md:border-t-0 md:pt-0">
            <h3 className="headline-md text-ink">Learning you can see</h3>
            <p className="body-sm text-ink-soft">
              Every story carries a tag that says why it is in your paper, and your interests page shows what moved and why.
              In a simulated week, the learning paper scored 0.52 nDCG@10 on day 7, against 0.34 for the same reader&rsquo;s
              profile left as onboarding set it.
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="headline-lg text-ink">0.52</span>
              <span className="ui-meta text-ink-muted">learning, day 7</span>
              <span className="headline-lg text-ink-muted">0.34</span>
              <span className="ui-meta text-ink-muted">static profile</span>
            </p>
          </article>
          <article className="mt-6 flex flex-col gap-2 border-t border-rule pt-6">
            <h3 className="headline-md text-ink">Listen, and other angles</h3>
            <p className="body-sm text-ink-soft">
              Listen reads your paper aloud in your browser&rsquo;s own voice. Other angles shows how several outlets covered one
              story: what they agree on, and where they differ.
            </p>
          </article>
          <article className="mt-6 flex flex-col gap-2 border-t border-rule pt-6">
            <h3 className="headline-md text-ink">Tell your editor</h3>
            <p className="body-sm text-ink-soft">
              Say what you want in plain words, like &ldquo;less cricket, more space&rdquo;. Morrow proposes the change, you
              confirm it, and today&rsquo;s paper is set again.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="flex flex-col gap-3 border-t border-ink pt-4 md:flex-row md:items-baseline md:justify-between">
      <p className="ui-meta text-ink-muted">Built for the NaSCon&rsquo;26 AI Hackathon, Islamabad.</p>
      <nav aria-label="About this project" className="flex flex-wrap gap-x-6">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="ui-text inline-block py-2">
          <span className="text-pen underline underline-offset-4">GitHub</span>
        </a>
        <a href={ARCHITECTURE_URL} target="_blank" rel="noopener noreferrer" className="ui-text inline-block py-2">
          <span className="text-pen underline underline-offset-4">Architecture</span>
        </a>
      </nav>
    </footer>
  );
}
