// Print-only parts of the paper, set in Morrow type classes. Static markup: no handlers, no buttons.
import { Masthead } from '@/components/morrow';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { WeightDelta } from '@/contracts/signals';
import { BRAND } from '@/lib/brand';
import { clampWords, countSources, formatPaperDate, pickSummary, sectionName, storyHref } from '@/server/pdf/layout';
import type { PrintModel, StoryRole } from '@/server/pdf/types';

/** The printed link of a story (headline, QR): through /r, so it is a learning signal. */
export function hrefOf(model: PrintModel, item: EditionItem): string {
  return storyHref(model.extras.appUrl, item.article.id, model.edition.id);
}

/** A story's kicker: its most specific topic, by the edition's display names. */
export function kickerOf(edition: Edition, item: EditionItem): string {
  return sectionName(edition, item.article.labels[0]?.slug ?? item.sectionSlug);
}

/** "Prepared for {first name}" uses the first word of the display name. */
export function firstName(displayName: string | null): string | null {
  return displayName?.trim().split(/\s+/)[0] || null;
}

/** A story's QR code (an inlined SVG) inside a link to the same URL. */
export function Qr({ svg, href }: { svg: string; href: string }) {
  return (
    <a className="qr-link" href={href} aria-label="Read the original story">
      <span className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
    </a>
  );
}

/** Every story ends with its source and a QR code to the original. */
export function StorySource({ model, item }: { model: PrintModel; item: EditionItem }) {
  const href = hrefOf(model, item);
  const svg = model.assets.qr[item.article.id];
  return (
    <footer className="source">
      <span className="ui-meta source__text">
        <span className="source__name">{item.article.sourceName}</span>
        <a href={href}>{svg ? 'Scan for the full story' : item.article.sourceDomain}</a>
      </span>
      {svg ? <Qr svg={svg} href={href} /> : null}
    </footer>
  );
}

/** The story's picture as an inlined data URI, or a paper-sunk block naming its section. */
export function ImageOrFallback({ model, item, size }: { model: PrintModel; item: EditionItem; size: 'lead' | 'section' }) {
  const src = model.assets.images[item.article.id];
  return (
    <div className={`visual visual--${size}`}>
      {src ? (
        <figure className="figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- static print markup with an inlined data URI */}
          <img src={src} alt="" />
        </figure>
      ) : (
        <div className="img-fallback">
          <span className="dateline">{sectionName(model.edition, item.sectionSlug)}</span>
        </div>
      )}
    </div>
  );
}

/** Kicker, headline (linked), summary at the role's budget, then source and QR. */
export function StoryBlock({ model, item, role }: { model: PrintModel; item: EditionItem; role: StoryRole }) {
  return (
    <article className={`story story--${role}`}>
      <header className="story__head">
        <p className="print-kicker">{kickerOf(model.edition, item)}</p>
        <h3 className="print-headline">
          <a href={hrefOf(model, item)}>{item.article.headline}</a>
        </h3>
      </header>
      <p className="print-body">{pickSummary(item, role, model.layout.budgets)}</p>
      <StorySource model={model} item={item} />
    </article>
  );
}

/** A brief: a bold body-size headline, a one-sentence summary, then source and domain (linked through /r). */
export function RunInBrief({ model, item }: { model: PrintModel; item: EditionItem }) {
  const href = hrefOf(model, item);
  return (
    <article className="story story--brief">
      <p className="print-kicker">{kickerOf(model.edition, item)}</p>
      <h3 className="print-body brief__headline">
        <a href={href}>{item.article.headline}</a>
      </h3>
      <p className="print-body brief__text">{pickSummary(item, 'brief', model.layout.budgets)}</p>
      <p className="ui-meta brief__meta">
        <a href={href}>{`${item.article.sourceName} · ${item.article.sourceDomain}`}</a>
      </p>
    </article>
  );
}

/** A strip of briefs under its own section head, in up to 3 ruled columns. */
export function BriefStrip({ model, items }: { model: PrintModel; items: EditionItem[] }) {
  return (
    <div className="briefs">
      <SectionHead title="In brief" />
      <div className={`brief-strip brief-strip--${Math.min(3, items.length)}`}>
        {items.map((item) => (
          <RunInBrief key={item.article.id} model={model} item={item} />
        ))}
      </div>
    </div>
  );
}

/** The Morrow compact masthead as the running head of every page after the first. */
export function RunningHead({ model, page }: { model: PrintModel; page: number }) {
  return (
    <Masthead
      variant="compact"
      title={BRAND.nameplate}
      date={formatPaperDate(model.edition.date)}
      actions={<span className="dateline">{`Page ${page}`}</span>}
    />
  );
}

/** A heavy rule over the section name in print-kicker. */
export function SectionHead({ title }: { title: string }) {
  return (
    <header className="section-head">
      <h2 className="print-kicker">{title}</h2>
    </header>
  );
}

/** Every page ends with who the paper was made for and from how many outlets. */
export function PageFoot({ model }: { model: PrintModel }) {
  const who = firstName(model.extras.displayName) ?? 'you';
  return <footer className="foot dateline">{`Prepared for ${who} · from ${countSources(model.layout)} sources`}</footer>;
}

// A teaser has three lines of a 34 mm column; six words end on a word, not mid-word.
const TEASER_WORDS = 6;

/** A front-page pointer to a story inside the paper. */
export function Teaser({ model, item, page }: { model: PrintModel; item: EditionItem; page: number }) {
  return (
    <a className="teaser" href={`#page-${page}`}>
      <span className="print-kicker">{sectionName(model.edition, item.sectionSlug)}</span>
      <span className="print-headline teaser__headline">{clampWords(item.article.headline, TEASER_WORDS)}</span>
      <span className="dateline teaser__page">{`Page ${page}`}</span>
    </a>
  );
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/** What moved in the reader's interests: a before bar (rule-strong) over an after bar (pen), width by weight. */
export function MoverBars({ movers }: { movers: WeightDelta[] }) {
  return (
    <ul className="movers">
      {movers.map((m) => {
        const before = clamp01(m.before);
        const after = clamp01(m.after);
        return (
          <li key={m.slug} className="mover">
            <span className="ui-label">{m.name}</span>
            <svg className="mover__bars" viewBox="0 0 100 12" preserveAspectRatio="none" role="img"
              aria-label={`${m.name}: ${Math.round(before * 100)} to ${Math.round(after * 100)} out of 100`}>
              <rect className="bar-track" x="0" y="0" width="100" height="5" />
              <rect className="bar--before" x="0" y="0" width={(before * 100).toFixed(1)} height="5" />
              <rect className="bar-track" x="0" y="7" width="100" height="5" />
              <rect className="bar--after" x="0" y="7" width={(after * 100).toFixed(1)} height="5" />
            </svg>
            <span className="ui-meta mover__delta">{m.after >= m.before ? 'More in your paper' : 'Less in your paper'}</span>
          </li>
        );
      })}
    </ul>
  );
}
