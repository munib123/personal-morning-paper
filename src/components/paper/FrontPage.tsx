'use client';
// The Front page (design README "Layout: the web paper", ARCHITECTURE §3a): masthead, the editor's
// note, above the fold (lead | recall, "Three things to know", the second story), the sections in
// affinity order, "Beyond your usual", then "In brief" beside one "Long read". Columns are separated
// by a 1px rule, never by colour; rank shows by headline size and position.
import { useMemo, type ReactNode } from 'react';
import { SectionHeader, TakeawayBox } from '@/components/morrow';
import { MorningRecallCard } from '@/components/recall/MorningRecallCard';
import { PaperStory } from '@/components/story/PaperStory';
import { sectionLabel, takeawaysOf, type CardVariant } from '@/components/story/format';
import type { Edition, EditionItem } from '@/contracts/edition';
import { useEdition } from './EditionContext';
import { layoutFrontPage } from './layout';
import { PaperMasthead } from './PaperMasthead';

export interface FrontPageProps {
  readerName: string | null;
  city: string | null;
  /** The end of paper (Task 10) closes the page. */
  end?: ReactNode;
  onHowMade?: () => void;
}

const slugId = (slug: string) => `section-${slug.replace(/[^a-z0-9]+/gi, '-')}`;

function chunk<T>(list: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

/** Only the lead's wide column has room for the labelled FeedbackBar; columns use the icon-only one. */
function Story({ item, variant, withDeck }: { item: EditionItem; variant: CardVariant; withDeck?: boolean }) {
  return <PaperStory item={item} variant={variant} withDeck={withDeck} compactFeedback={variant !== 'lead'} />;
}

/** Rows of three standard stories with a rule between columns (one column, ruled, on phones). */
function StoryColumns({ items }: { items: EditionItem[] }) {
  return (
    <div className="flex flex-col divide-y divide-rule">
      {chunk(items, 3).map((row) => (
        <div
          key={row.map((i) => i.article.id).join('|')}
          className="grid divide-y divide-rule py-6 first:pt-0 last:pb-0 md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          {row.map((item) => (
            <div key={item.article.id} className="py-6 first:pt-0 last:pb-0 md:px-3 md:py-0 md:first:pl-0 md:last:pr-0">
              <Story item={item} variant="standard" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaperSection({ id, title, items }: { id: string; title: string; items: EditionItem[] }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} />
      <StoryColumns items={items} />
    </section>
  );
}

function EditorNote({ edition }: { edition: Edition }) {
  if (!edition.editorNote) return null;
  return (
    <div className="mt-6 max-w-(--measure)">
      <p className="ui-text text-ink-soft">{edition.editorNote}</p>
      {edition.editorNoteSource === 'gemini' ? <p className="ui-meta mt-1 text-ink-muted">Note written with AI</p> : null}
    </div>
  );
}

export function FrontPage({ readerName, city, end, onHowMade }: FrontPageProps) {
  const { edition, state, readOnly } = useEdition();
  const layout = useMemo(
    () => layoutFrontPage(state.items, edition.sectionOrder, edition.leadArticleId),
    [state.items, edition.sectionOrder, edition.leadArticleId],
  );
  const takeaways = takeawaysOf(layout.topThree, edition.id, edition.sectionNames);
  const both = layout.briefs.length > 0 && layout.longRead !== null;

  return (
    <div className="mx-auto w-full max-w-(--page-max) px-4 pb-16 md:px-6">
      <PaperMasthead readerName={readerName} city={city} onHowMade={onHowMade} />
      <EditorNote edition={edition} />

      <section aria-labelledby="above-the-fold" className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr] lg:gap-0 lg:divide-x lg:divide-rule">
        <h2 id="above-the-fold" className="sr-only">
          Top stories
        </h2>
        <div className="lg:pr-6">{layout.lead ? <Story item={layout.lead} variant="lead" withDeck /> : null}</div>
        <div className="flex flex-col gap-6 lg:pl-6">
          {!readOnly && edition.recall.length > 0 ? <MorningRecallCard questions={edition.recall} editionId={edition.id} /> : null}
          {takeaways.length > 0 ? <TakeawayBox items={takeaways} /> : null}
          {layout.second ? <Story item={layout.second} variant="standard" withDeck /> : null}
        </div>
      </section>

      <div className="mt-8 space-y-8 md:mt-12 md:space-y-12">
        {layout.sections.map((s) => (
          <PaperSection key={s.slug} id={slugId(s.slug)} title={sectionLabel(s.slug, edition.sectionNames)} items={s.items} />
        ))}
        {layout.beyond.length > 0 ? <PaperSection id="section-beyond" title="Beyond your usual" items={layout.beyond} /> : null}
        {layout.briefs.length > 0 || layout.longRead ? (
          <div className={both ? 'grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-rule' : undefined}>
            {layout.briefs.length > 0 ? (
              <section aria-labelledby="section-in-brief" className={both ? 'md:pr-3' : undefined}>
                <SectionHeader id="section-in-brief" title="In brief" />
                {layout.briefs.map((item) => (
                  <Story key={item.article.id} item={item} variant="brief" />
                ))}
              </section>
            ) : null}
            {layout.longRead ? (
              <section aria-labelledby="section-long-read" className={both ? 'md:pl-3' : undefined}>
                <SectionHeader id="section-long-read" title="Long read" />
                <Story item={layout.longRead} variant="compact" />
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {end}
    </div>
  );
}

export default FrontPage;
