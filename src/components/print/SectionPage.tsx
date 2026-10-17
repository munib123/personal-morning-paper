// An inner page: the running head, one section, its lead opened with picture and pull quote, then every
// story in 3-5 ruled columns, and on a page with room a strip of briefs.
import { PullQuote } from '@/components/morrow';
import { pickSummary, sectionName } from '@/server/pdf/layout';
import type { InnerPage, PrintModel } from '@/server/pdf/types';
import { BriefStrip, hrefOf, ImageOrFallback, kickerOf, PageFoot, RunningHead, SectionHead, StoryBlock, StorySource } from './parts';

export function SectionPage({ model, page, number }: { model: PrintModel; page: InnerPage; number: number }) {
  const { edition, layout } = model;
  const [lead, ...rest] = page.items;
  const quote = lead.article.whyItMatters ?? lead.article.keyFact;
  const cols = Math.min(5, Math.max(3, page.items.length));
  return (
    <section className="page page--section" id={`page-${number}`}>
      <RunningHead model={model} page={number} />
      <SectionHead title={sectionName(edition, page.root)} />
      <div className="opener">
        <p className="print-kicker">{kickerOf(edition, lead)}</p>
        <h3 className="print-lead">
          <a href={hrefOf(model, lead)}>{lead.article.headline}</a>
        </h3>
        <div className={quote ? 'opener__row' : 'opener__row opener__row--solo'}>
          <ImageOrFallback model={model} item={lead} size="section" />
          {quote ? <PullQuote quote={quote} /> : null}
        </div>
      </div>
      <div className={`cols cols--${cols}`}>
        <article className="story story--section-lead">
          <p className="print-body">{pickSummary(lead, 'section-lead', layout.budgets)}</p>
          <StorySource model={model} item={lead} />
        </article>
        {rest.map((item) => (
          <StoryBlock key={item.article.id} model={model} item={item} role="secondary" />
        ))}
      </div>
      {page.briefs?.length ? <BriefStrip model={model} items={page.briefs} /> : null}
      <PageFoot model={model} />
    </section>
  );
}
