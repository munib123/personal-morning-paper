import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Edition, EditionItem } from '@/contracts/edition';
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { DoneForToday } from './DoneForToday';
import { doneStreakLine, pickThreeThings } from './three-things';

const items = FIXTURE_EDITION.items;
const withRecall = items.filter((i) => i.article.recall !== null);
const view = (over: Partial<StreakView>): StreakView => ({ ...FIXTURE_STREAK, ...over });

function editionWith(article: Partial<EditionItem['article']>, sectionSlug = 'made.up-section'): Edition {
  const base = items[0];
  return { ...FIXTURE_EDITION, items: [{ ...base, sectionSlug, article: { ...base.article, id: 'x1', ...article } }], reserve: [] };
}

describe('pickThreeThings', () => {
  it('keeps the readIds order (most dwell first) with section, fact and recall', () => {
    const [a, b] = [items[2], items[0]];
    const things = pickThreeThings(FIXTURE_EDITION, [a.article.id, b.article.id]);
    expect(things.map((t) => t.articleId)).toEqual([a.article.id, b.article.id]);
    expect(things[0]).toEqual({
      articleId: a.article.id,
      section: FIXTURE_EDITION.sectionNames[a.sectionSlug],
      headline: a.article.headline,
      fact: a.article.keyFact ?? a.article.whyItMatters ?? a.article.summary.brief,
      recall: a.article.recall,
    });
  });

  it('falls back from keyFact to whyItMatters to the brief summary, and the section to its slug', () => {
    const why = editionWith({ keyFact: null, whyItMatters: 'Why it matters.' });
    expect(pickThreeThings(why, ['x1'])[0]).toMatchObject({ fact: 'Why it matters.', section: 'made.up-section' });
    const brief = editionWith({ keyFact: null, whyItMatters: null, summary: { brief: 'Brief.', std: 'Std.', deep: 'Deep.' } });
    expect(pickThreeThings(brief, ['x1'])[0].fact).toBe('Brief.');
  });

  it('caps at three, handles none, and skips unknown ids', () => {
    expect(pickThreeThings(FIXTURE_EDITION, items.slice(0, 5).map((i) => i.article.id))).toHaveLength(3);
    expect(pickThreeThings(FIXTURE_EDITION, [])).toEqual([]);
    expect(pickThreeThings(FIXTURE_EDITION, ['nope', items[1].article.id, 'nope']).map((t) => t.articleId)).toEqual([items[1].article.id]);
  });

  it('counts a promoted reserve story and never repeats a story', () => {
    const reserveId = FIXTURE_EDITION.reserve[0].article.id;
    expect(pickThreeThings(FIXTURE_EDITION, [reserveId, reserveId]).map((t) => t.articleId)).toEqual([reserveId]);
  });
});

describe('doneStreakLine', () => {
  it('is one calm line per state', () => {
    expect(doneStreakLine(view({ state: 'done_today', current: 4 }))).toBe('Day 4 of your streak. See you tomorrow at 7.');
    expect(doneStreakLine(view({ state: 'pending', current: 4 }))).toBe('Read one story to keep your 4-day streak.');
    expect(doneStreakLine(view({ state: 'broken', current: 0, totalDays: 42 }))).toBe('42 reading days so far.');
    expect(doneStreakLine(view({ state: 'new', current: 0, totalDays: 0 }))).toBe('Read one story to start your streak.');
  });
});

describe('DoneForToday', () => {
  it('with no reads: the closing line and a calm empty state, no box and no quiz', () => {
    const html = renderToStaticMarkup(createElement(DoneForToday, { edition: FIXTURE_EDITION, readIds: [], streak: null }));
    expect(html).toContain('That&#x27;s your paper for today.');
    expect(html).toContain('Read a story and its key fact lands here.');
    expect(html).not.toContain('mw-takeaway');
    expect(html).not.toContain('Quiz me now');
  });

  it('with three reads: three things, the recall teaser, the streak line and Quiz me now', () => {
    const ids = withRecall.slice(0, 3).map((i) => i.article.id);
    const html = renderToStaticMarkup(createElement(DoneForToday, { edition: FIXTURE_EDITION, readIds: ids, streak: view({ state: 'done_today', current: 6 }) }));
    expect(html).toContain('Three things you learned');
    expect(html.match(/mw-takeaway__item/g)).toHaveLength(3);
    expect(html).toContain('Tomorrow&#x27;s Morning Recall will ask about these.');
    expect(html).toContain('Quiz me now');
    expect(html).toContain('Day 6 of your streak. See you tomorrow at 7.');
  });

  it('titles the box by how many things there are', () => {
    const ids = withRecall.slice(0, 2).map((i) => i.article.id);
    const html = renderToStaticMarkup(createElement(DoneForToday, { edition: FIXTURE_EDITION, readIds: ids, streak: null }));
    expect(html).toContain('Two things you learned');
    expect(html).not.toContain('Day ');
  });
});
