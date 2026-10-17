import { describe, expect, it } from 'vitest';
import type { Edition, EditionItem } from '@/contracts/edition';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { rootOf } from '@/contracts/taxonomy';
import {
  buildPrintLayout,
  clampWords,
  countSources,
  firstSentence,
  formatPaperDate,
  insideIndex,
  pageCount,
  pageOf,
  pickSummary,
  sectionName,
  shortLink,
  shrinkLayout,
  storyHref,
  teasers,
} from './layout';
import { DEFAULT_BUDGETS, INNER_PAGE_CAPACITY, MAX_INNER_PAGES, RAIL_MAX, TEASER_COUNT, type PrintLayout } from './types';

const E = FIXTURE_EDITION;
const BEYOND = new Set(['bigstory', 'explore', 'serendipity']);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Every story the layout prints, in print order. */
function printedIds(l: PrintLayout): string[] {
  return [l.lead, ...l.rail, ...l.inner.flatMap((p) => p.items), ...l.beyond, ...l.briefs].map((i) => i.article.id);
}
const innerStories = (l: PrintLayout) => l.inner.reduce((n, p) => n + p.items.length, 0);

/** A thin edition: 12 items, no `top` slot, a sectionOrder root with no core items, no key facts. */
function thinEdition(): Edition {
  const items = E.items
    .filter((i) => i.slot !== 'top')
    .slice(0, 12)
    .map((i): EditionItem => ({ ...i, article: { ...i.article, keyFact: null } }));
  return { ...E, items, sectionOrder: ['arts', ...E.sectionOrder] };
}

describe('sectionName', () => {
  it('reads the display name from edition.sectionNames', () => {
    const slug = E.sectionOrder[0];
    expect(sectionName(E, slug)).toBe(E.sectionNames[slug]);
  });
  it('falls back to the sentence-cased last segment of the slug', () => {
    expect(sectionName(E, 'x.unknown-node')).toBe('Unknown node');
  });
});

describe('formatting helpers', () => {
  it('writes the date in full, the way the paper does', () => {
    expect(formatPaperDate('2026-10-17')).toBe('Saturday, 17 October 2026');
    expect(formatPaperDate('2026-01-01')).toBe('Thursday, 1 January 2026');
  });
  it('builds the print link through /r with src=print and the edition id', () => {
    const href = storyHref('https://subah.app', 'a1', 'e9');
    expect(href).toBe('https://subah.app/r/a1?src=print&e=e9');
    expect(shortLink(href)).toBe('subah.app/r/a1?src=print&e=e9');
    expect(storyHref('https://subah.app/', 'a1', 'e9')).toBe(href);
  });
  it('clamps text to a word budget with an ellipsis only when it cuts', () => {
    expect(clampWords('one two three', 2)).toBe('one two…');
    expect(clampWords('one two', 5)).toBe('one two');
    expect(clampWords('one, two three', 1)).toBe('one…');
  });
  it('takes the first sentence', () => {
    expect(firstSentence('Rates held. Markets rose.')).toBe('Rates held.');
    expect(firstSentence('Prices rose 2.5 percent in May. Then fell.')).toBe('Prices rose 2.5 percent in May.');
    expect(firstSentence('No full stop here')).toBe('No full stop here');
  });
});

describe('buildPrintLayout on the fixture edition', () => {
  const layout = buildPrintLayout(E);

  it('puts the edition lead on page 1 with up to RAIL_MAX top stories in the rail', () => {
    expect(layout.lead.article.id).toBe(E.leadArticleId);
    expect(layout.rail).toHaveLength(RAIL_MAX);
    expect(layout.rail.every((i) => i.slot === 'top')).toBe(true);
    expect(pageOf(layout, layout.lead.article.id)).toBe(1);
    expect(pageOf(layout, layout.rail[0].article.id)).toBe(1);
  });

  it('gives each of at most 3 sections an inner page of 2-5 stories from one root', () => {
    expect(layout.inner.length).toBeGreaterThanOrEqual(1);
    expect(layout.inner.length).toBeLessThanOrEqual(MAX_INNER_PAGES);
    for (const page of layout.inner) {
      expect(page.items.length).toBeGreaterThanOrEqual(2);
      expect(page.items.length).toBeLessThanOrEqual(INNER_PAGE_CAPACITY);
      expect(page.items.every((i) => rootOf(i.sectionSlug) === page.root)).toBe(true);
      const ranks = page.items.map((i) => i.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('prints every one of the 20 stories exactly once', () => {
    const ids = printedIds(layout);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it('opens the inner pages with the strongest section that has 2 or more flowing stories', () => {
    const railIds = new Set(layout.rail.map((i) => i.article.id));
    const flowing = E.items.filter(
      (i) => i.article.id !== E.leadArticleId && !railIds.has(i.article.id) && !BEYOND.has(i.slot),
    );
    const count = (root: string) => flowing.filter((i) => rootOf(i.sectionSlug) === root).length;
    const first = E.sectionOrder.map(rootOf).find((root) => count(root) >= 2);
    expect(layout.inner[0].root).toBe(first);
  });

  it('sends big story, explore and serendipity to "Beyond your usual" on the last page', () => {
    expect(layout.beyond.map((i) => i.slot)).toEqual(E.items.filter((i) => BEYOND.has(i.slot)).map((i) => i.slot));
    expect(pageOf(layout, layout.beyond[0].article.id)).toBe(pageCount(layout));
  });

  it('numbers pages: front, one per inner section, last', () => {
    expect(pageCount(layout)).toBe(2 + layout.inner.length);
    expect(pageOf(layout, layout.inner[0].items[0].article.id)).toBe(2);
    expect(pageOf(layout, layout.briefs[0].article.id)).toBe(pageCount(layout));
    expect(pageOf(layout, 'not-in-this-paper')).toBe(0);
  });

  it('keeps the briefs in rank order', () => {
    const ranks = layout.briefs.map((i) => i.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('teasers and the Inside index', () => {
  const layout = buildPrintLayout(E);

  it('points up to 5 teasers at inner pages, section leads first', () => {
    const list = teasers(layout);
    expect(list).toHaveLength(Math.min(TEASER_COUNT, innerStories(layout) + layout.briefs.length));
    expect(list[0].item.article.id).toBe(layout.inner[0].items[0].article.id);
    expect(list[0].page).toBe(2);
    for (const t of list) expect(t.page).toBe(pageOf(layout, t.item.article.id));
    expect(new Set(list.map((t) => t.item.article.id)).size).toBe(list.length);
  });

  it('lists each inner page by section name, then In brief on the last page', () => {
    const index = insideIndex(E, layout);
    expect(index).toEqual([
      ...layout.inner.map((p, k) => ({ label: sectionName(E, p.root), page: k + 2 })),
      { label: 'In brief', page: pageCount(layout) },
    ]);
  });
});

describe('buildPrintLayout thin edition', () => {
  it('lays out 12 items with no top slot without throwing', () => {
    const thin = thinEdition();
    expect(thin.items).toHaveLength(12);
    const layout = buildPrintLayout(thin);
    expect(layout.rail).toHaveLength(0);
    expect(pageCount(layout)).toBeGreaterThanOrEqual(2);
    expect(printedIds(layout)).toHaveLength(12);
    expect(layout.inner.every((p) => p.root !== 'arts')).toBe(true);
  });

  it('shows fewer than 5 teasers, with no empty slot, when the paper is short', () => {
    const tiny: Edition = { ...E, items: E.items.filter((i) => i.slot !== 'top' && i.slot !== 'core').concat(E.items[4], E.items[5]) };
    const layout = buildPrintLayout(tiny);
    const list = teasers(layout);
    expect(list.length).toBeLessThan(TEASER_COUNT);
    expect(list.every((t) => t.item && t.page >= 2)).toBe(true);
  });
});

describe('pickSummary', () => {
  const layout = buildPrintLayout(E);
  const item = (tier: EditionItem['tier']): EditionItem => ({ ...E.items[4], tier });

  it('uses the deep summary for the lead, clamped to 180 words', () => {
    const lead = layout.lead;
    expect(pickSummary(lead, 'lead', DEFAULT_BUDGETS)).toBe(clampWords(lead.article.summary.deep, 180));
    const long: EditionItem = { ...lead, article: { ...lead.article, summary: { ...lead.article.summary, deep: 'word '.repeat(200).trim() } } };
    const text = pickSummary(long, 'lead', DEFAULT_BUDGETS);
    expect(words(text)).toBe(180);
    expect(text.endsWith('…')).toBe(true);
  });

  it('follows the tier for section leads and secondary stories', () => {
    const s = E.items[4].article.summary;
    expect(pickSummary(item('deep'), 'section-lead', DEFAULT_BUDGETS)).toBe(clampWords(s.deep, 120));
    expect(pickSummary(item('std'), 'section-lead', DEFAULT_BUDGETS)).toBe(clampWords(s.std, 120));
    expect(pickSummary(item('brief'), 'secondary', DEFAULT_BUDGETS)).toBe(clampWords(s.brief, 70));
    expect(pickSummary(item('deep'), 'secondary', DEFAULT_BUDGETS)).toBe(clampWords(s.std, 70));
    expect(pickSummary(item('deep'), 'rail', DEFAULT_BUDGETS)).toBe(clampWords(s.std, 70));
    expect(pickSummary(item('deep'), 'brief', DEFAULT_BUDGETS)).toBe(clampWords(s.brief, 45));
  });
});

describe('shrinkLayout', () => {
  const layout = buildPrintLayout(E);

  it('moves the last story of an overflowing inner page to the top of the briefs', () => {
    const last = layout.inner[0].items[layout.inner[0].items.length - 1];
    const next = shrinkLayout(layout, [2]);
    expect(next).not.toBeNull();
    expect(next!.inner[0].items).toHaveLength(layout.inner[0].items.length - 1);
    expect(next!.briefs[0].article.id).toBe(last.article.id);
    expect(layout.inner[0].items).toContain(last); // pure: the input is untouched
  });

  it('shortens the lead first, then moves the second rail story, when page 1 overflows', () => {
    const once = shrinkLayout(layout, [1]);
    expect(once!.budgets.lead).toBe(120);
    expect(once!.rail).toHaveLength(2);
    const twice = shrinkLayout(once!, [1]);
    expect(twice!.rail).toHaveLength(1);
    expect(twice!.briefs[0].article.id).toBe(layout.rail[1].article.id);
  });

  it('shortens the briefs first, then drops the last one, when the last page overflows', () => {
    const last = pageCount(layout);
    const once = shrinkLayout(layout, [last]);
    expect(once!.budgets.brief).toBe(30);
    expect(once!.briefs).toHaveLength(layout.briefs.length);
    const twice = shrinkLayout(once!, [last]);
    expect(twice!.briefs).toHaveLength(layout.briefs.length - 1);
  });

  it('returns null when nothing can move', () => {
    const stuck: PrintLayout = {
      ...layout,
      rail: layout.rail.slice(0, 1),
      inner: [{ root: layout.inner[0].root, items: layout.inner[0].items.slice(0, 1) }],
      briefs: [],
      budgets: { ...DEFAULT_BUDGETS, lead: 120, brief: 30 },
    };
    expect(shrinkLayout(stuck, [1, 2, 3])).toBeNull();
    expect(shrinkLayout(layout, [])).toBeNull();
  });
});

describe('countSources', () => {
  it('counts the distinct outlets across every printed story', () => {
    expect(countSources(buildPrintLayout(E))).toBe(new Set(E.items.map((i) => i.article.sourceName)).size);
  });
});
