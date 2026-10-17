// PDF page 1 (design README "Layout: the PDF"): the full Morrow masthead, a 5-column grid with the lead in
// columns 1-3 and "Three things to know", the rail stories and the Inside index in 4-5, then the teaser row.
import { Masthead, TakeawayBox } from '@/components/morrow';
import type { EditionItem } from '@/contracts/edition';
import { BRAND } from '@/lib/brand';
import { firstSentence, formatPaperDate, insideIndex, pageCount, pickSummary, teasers } from '@/server/pdf/layout';
import type { PrintModel } from '@/server/pdf/types';
import { firstName, hrefOf, ImageOrFallback, kickerOf, PageFoot, StoryBlock, StorySource, Teaser } from './parts';

const uniqueById = (items: EditionItem[]) =>
  items.filter((item, k) => items.findIndex((i) => i.article.id === item.article.id) === k);

/** One sentence a reader can carry away: the key fact, else the first sentence of the brief. */
export function takeawayOf(item: EditionItem): string {
  return item.article.keyFact?.trim() || firstSentence(item.article.summary.brief);
}

/** The stories behind "Three things to know": lead and rail in rank order, padded from the section leads. */
export function knowItems(model: PrintModel): EditionItem[] {
  const { layout } = model;
  const top = [layout.lead, ...layout.rail].sort((a, b) => a.rank - b.rank);
  return uniqueById([...top, ...layout.inner.map((p) => p.items[0])]).slice(0, 3);
}

export function threeThingsToKnow(model: PrintModel): string[] {
  return knowItems(model).map(takeawayOf);
}

export function FrontPage({ model }: { model: PrintModel }) {
  const { edition, layout, extras } = model;
  const total = pageCount(layout);
  const lead = layout.lead;
  const href = hrefOf(model, lead);
  return (
    <section className="page page--front" id="page-1">
      <Masthead
        variant="full"
        title={BRAND.nameplate}
        edition={edition.number}
        reader={firstName(extras.displayName) ?? undefined}
        date={formatPaperDate(edition.date)}
        location={extras.city}
        readingTime={`Page 1 of ${total}`}
      />
      <div className="front">
        <article className="front__lead">
          <p className="print-kicker">{kickerOf(edition, lead)}</p>
          <h3 className="print-lead">
            <a href={href}>{lead.article.headline}</a>
          </h3>
          <p className="deck front__deck">{lead.article.whyItMatters ?? firstSentence(lead.article.summary.brief)}</p>
          <ImageOrFallback model={model} item={lead} size="lead" />
          <p className="print-body lead-body">{pickSummary(lead, 'lead', layout.budgets)}</p>
          <StorySource model={model} item={lead} />
        </article>
        <div className="front__rail">
          <TakeawayBox
            title="Three things to know"
            items={knowItems(model).map((item) => ({ text: takeawayOf(item), href: hrefOf(model, item) }))}
          />
          {layout.rail.map((item) => (
            <StoryBlock key={item.article.id} model={model} item={item} role="rail" />
          ))}
          <nav className="inside" aria-label="Inside this paper">
            <h2 className="dateline inside__title">Inside</h2>
            <ol className="inside__list">
              {insideIndex(edition, layout).map((row) => (
                <li key={`${row.label}-${row.page}`} className="ui-label">
                  <a href={`#page-${row.page}`}>
                    <span>{row.label}</span>
                    <span className="inside__page">{`Page ${row.page}`}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
      <nav className="teasers" aria-label="More in this paper">
        {teasers(layout).map((t) => (
          <Teaser key={t.item.article.id} model={model} item={t.item} page={t.page} />
        ))}
      </nav>
      <PageFoot model={model} />
    </section>
  );
}
