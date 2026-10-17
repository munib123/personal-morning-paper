// The last page: "Beyond your usual" and "In brief" in ruled columns, then what the paper learned:
// "Why these stories" (movers and reasons) and "Three things you learned".
import { TakeawayBox } from '@/components/morrow';
import type { EditionItem, ReasonCode } from '@/contracts/edition';
import { pageCount, pickSummary } from '@/server/pdf/layout';
import type { PrintModel } from '@/server/pdf/types';
import { knowItems, takeawayOf } from './FrontPage';
import { hrefOf, kickerOf, MoverBars, PageFoot, RunningHead, SectionHead } from './parts';

const printedItems = (model: PrintModel): EditionItem[] => {
  const l = model.layout;
  return [l.lead, ...l.rail, ...l.inner.flatMap((p) => p.items), ...l.beyond, ...l.briefs];
};

/** The stories behind "Three things you learned": inner section leads, then other inner stories, never page 1's. */
export function learnedItems(model: PrintModel): EditionItem[] {
  const used = new Set(knowItems(model).map((i) => i.article.id));
  const l = model.layout;
  const pool = [...l.inner.map((p) => p.items[0]), ...l.inner.flatMap((p) => p.items.slice(1)), ...l.beyond, ...l.briefs];
  return pool.filter((i) => !used.has(i.article.id)).slice(0, 3);
}

export function threeThingsLearned(model: PrintModel): string[] {
  return learnedItems(model).map(takeawayOf);
}

// Why a story is in the paper, in the reader's own terms (design README "Voice and copy").
const REASON_PHRASES: Record<ReasonCode, (n: number) => string> = {
  topic: (n) => `${n} from topics you follow`,
  pinned: (n) => `${n} from topics you pinned`,
  similar: (n) => `${n} like stories you read`,
  bigstory: (n) => (n === 1 ? '1 big story of the day' : `${n} big stories of the day`),
  explore: (n) => `${n} trying something new`,
  serendipity: (n) => (n === 1 ? '1 step outside your usual' : `${n} steps outside your usual`),
  fresh: (n) => `${n} fresh this morning`,
};
const REASON_ORDER: ReasonCode[] = ['topic', 'pinned', 'similar', 'bigstory', 'explore', 'serendipity', 'fresh'];

/** "14 from topics you follow · 2 trying something new · 1 step outside your usual" over the printed stories. */
export function reasonLine(model: PrintModel): string {
  const counts = new Map<ReasonCode, number>();
  for (const item of printedItems(model)) {
    const code = item.reasons[0]?.code;
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return REASON_ORDER.filter((c) => counts.has(c))
    .sort((a, b) => counts.get(b)! - counts.get(a)! || REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b))
    .map((c) => REASON_PHRASES[c](counts.get(c)!))
    .join(' · ');
}

function Brief({ model, item, why }: { model: PrintModel; item: EditionItem; why?: boolean }) {
  const href = hrefOf(model, item);
  const reason = why ? item.reasons[0]?.text : null;
  return (
    <article className="story story--brief">
      <header className="story__head">
        <p className="print-kicker">{kickerOf(model.edition, item)}</p>
        <h3 className="print-headline">
          <a href={href}>{item.article.headline}</a>
        </h3>
      </header>
      {reason ? <p className="ui-meta why">{reason}</p> : null}
      <p className="print-body">{pickSummary(item, 'brief', model.layout.budgets)}</p>
      <p className="ui-meta brief__meta">
        <a href={href}>{`${item.article.sourceName} · ${item.article.sourceDomain}`}</a>
      </p>
    </article>
  );
}

export function LastPage({ model }: { model: PrintModel }) {
  const { layout, extras } = model;
  const total = pageCount(layout);
  return (
    <section className="page page--last" id={`page-${total}`}>
      <RunningHead model={model} page={total} />
      <div className="last">
        <div className="last__main">
          {layout.beyond.length ? (
            <>
              <SectionHead title="Beyond your usual" />
              <div className="cols cols--3">
                {layout.beyond.map((item) => (
                  <Brief key={item.article.id} model={model} item={item} why />
                ))}
              </div>
            </>
          ) : null}
          {layout.briefs.length ? (
            <>
              <SectionHead title="In brief" />
              <div className="cols cols--3">
                {layout.briefs.map((item) => (
                  <Brief key={item.article.id} model={model} item={item} />
                ))}
              </div>
            </>
          ) : null}
        </div>
        <aside className="last__rail">
          <SectionHead title="Why these stories" />
          {extras.movers.length ? <MoverBars movers={extras.movers.slice(0, 5)} /> : null}
          <p className="ui-meta reasons">{reasonLine(model)}</p>
          <TakeawayBox
            title="Three things you learned"
            items={learnedItems(model).map((item) => ({ text: takeawayOf(item), href: hrefOf(model, item) }))}
            footnote="Tomorrow's Morning Recall will ask you about these."
          />
        </aside>
      </div>
      <PageFoot model={model} />
    </section>
  );
}
