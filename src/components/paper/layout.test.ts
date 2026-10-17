import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { Tier } from '@/contracts/article';
import type { EditionItem, Slot } from '@/contracts/edition';
import type { TopicSlug } from '@/contracts/taxonomy';
import { layoutFrontPage, type FrontPageLayout } from './layout';

const base = FIXTURE_EDITION.items[4];
function makeItem(rank: number, slot: Slot, sectionSlug: TopicSlug, tier: Tier = 'std', readingMinutes = 3): EditionItem {
  return { ...base, rank, slot, sectionSlug, tier, article: { ...base.article, id: `art-${rank}`, readingMinutes } };
}

const placed = (l: FrontPageLayout): EditionItem[] =>
  [l.lead, l.second, ...l.sections.flatMap((s) => s.items), ...l.beyond, ...l.briefs, l.longRead].filter(
    (i): i is EditionItem => i !== null,
  );
const ranks = (items: EditionItem[]) => items.map((i) => i.rank);

describe('layoutFrontPage', () => {
  const fixture = layoutFrontPage(FIXTURE_EDITION.items, FIXTURE_EDITION.sectionOrder, FIXTURE_EDITION.leadArticleId);

  it('fixture: every item placed once', () => {
    expect(fixture.lead?.slot).toBe('lead');
    const tops = FIXTURE_EDITION.items.filter((i) => i.slot === 'top').sort((a, b) => a.rank - b.rank);
    expect(fixture.second).toBe(tops[0]);
    const ids = placed(fixture).map((i) => i.article.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it('topThree are ranks 1..3 (references, not extra placements)', () => {
    expect(ranks(fixture.topThree)).toEqual([1, 2, 3]);
    fixture.topThree.forEach((item) => expect(FIXTURE_EDITION.items).toContain(item));
  });

  it('beyond holds bigstory/explore/serendipity', () => {
    expect(fixture.beyond.length).toBe(4);
    for (const item of fixture.beyond) expect(['bigstory', 'explore', 'serendipity']).toContain(item.slot);
    const inSections = new Set(fixture.sections.flatMap((s) => s.items.map((i) => i.article.id)));
    for (const item of fixture.beyond) expect(inSections.has(item.article.id)).toBe(false);
  });

  it('briefs and long read', () => {
    const items = [
      makeItem(1, 'lead', 'technical', 'deep', 4),
      makeItem(2, 'top', 'sports'),
      makeItem(3, 'top', 'science'),
      makeItem(4, 'core', 'technical', 'brief', 2),
      makeItem(5, 'core', 'sports', 'std', 9),
      makeItem(6, 'core', 'sports', 'std', 7),
      makeItem(7, 'core', 'technical', 'brief', 12),
      makeItem(8, 'explore', 'arts', 'brief', 2),
    ];
    const l = layoutFrontPage(items, ['sports', 'technical', 'science'], 'art-1');
    expect(ranks(l.briefs)).toEqual([4, 7]);
    expect(l.longRead?.rank).toBe(5);
    expect(ranks(l.beyond)).toEqual([8]);
    const inSections = l.sections.flatMap((s) => ranks(s.items));
    expect(inSections).toEqual(expect.not.arrayContaining([4, 5, 7, 8]));
    expect(placed(l)).toHaveLength(items.length);

    const short = items.map((i) => (i.rank === 5 || i.rank === 6 ? { ...i, article: { ...i.article, readingMinutes: 5 } } : i));
    expect(layoutFrontPage(short, ['sports'], 'art-1').longRead).toBeNull();
  });

  it('In brief keeps at most the 6 lowest-ranked brief stories; the rest stay in their sections', () => {
    const items = [
      makeItem(1, 'lead', 'news', 'deep'),
      makeItem(2, 'top', 'news'),
      ...Array.from({ length: 14 }, (_, k) => makeItem(3 + k, 'core', k % 2 ? 'sports' : 'technical', 'brief', 2)),
    ];
    const l = layoutFrontPage(items, ['technical', 'sports'], 'art-1');
    expect(ranks(l.briefs)).toEqual([11, 12, 13, 14, 15, 16]);
    expect(l.sections.map((s) => s.slug)).toEqual(['technical', 'sports']);
    expect(l.sections.flatMap((s) => ranks(s.items)).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(placed(l)).toHaveLength(items.length);
  });

  it('sections follow sectionOrder, ancestor match', () => {
    const items = [
      makeItem(1, 'lead', 'news'),
      makeItem(2, 'top', 'news'),
      makeItem(3, 'core', 'technical.cs.ai-ml'),
      makeItem(4, 'core', 'sports.cricket'),
      makeItem(5, 'core', 'technical'),
      makeItem(6, 'top', 'sports'),
    ];
    const l = layoutFrontPage(items, ['sports', 'technical'], 'art-1');
    expect(l.sections.map((s) => s.slug)).toEqual(['sports', 'technical']);
    expect(ranks(l.sections[0].items)).toEqual([4, 6]); // tops other than second join their sections, in rank order
    expect(ranks(l.sections[1].items)).toEqual([3, 5]);
  });

  it('unknown section appended, empty groups omitted', () => {
    const items = [
      makeItem(1, 'lead', 'news'),
      makeItem(2, 'top', 'news'),
      makeItem(3, 'core', 'arts.books'),
      makeItem(4, 'core', 'sports'),
      makeItem(5, 'core', 'lifestyle.food'),
      makeItem(6, 'core', 'arts'),
    ];
    const l = layoutFrontPage(items, ['sports', 'science'], 'art-1');
    expect(l.sections.map((s) => s.slug)).toEqual(['sports', 'arts', 'lifestyle']);
    expect(ranks(l.sections[1].items)).toEqual([3, 6]);
  });

  it('no lead slot falls back to leadArticleId, then rank 1', () => {
    const items = [makeItem(3, 'core', 'science'), makeItem(1, 'top', 'news'), makeItem(2, 'top', 'sports')];
    const byId = layoutFrontPage(items, ['science'], 'art-2');
    expect(byId.lead?.rank).toBe(2);
    expect(byId.second?.rank).toBe(1);
    const byRank = layoutFrontPage(items, ['science'], 'missing');
    expect(byRank.lead?.rank).toBe(1);
    expect(byRank.second?.rank).toBe(2);
    expect(ranks(byRank.topThree)).toEqual([1, 2, 3]);
  });

  it('copes with an empty edition', () => {
    const l = layoutFrontPage([], [], '');
    expect(l).toEqual({ lead: null, second: null, topThree: [], sections: [], beyond: [], briefs: [], longRead: null });
  });
});
