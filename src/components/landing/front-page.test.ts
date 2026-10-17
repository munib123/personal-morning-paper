import { describe, expect, test } from 'vitest';
import { agoLabel, pickFrontPage, sectionName, toStory, type FrontPageCandidate } from './front-page';

const NOW = new Date('2026-10-17T12:00:00.000Z');

function c(over: Partial<FrontPageCandidate> & { id: string }): FrontPageCandidate {
  return {
    headline: `Headline ${over.id}`,
    sourceName: 'Dawn - Home',
    sectionSlug: 'news.pakistan',
    url: `https://example.com/${over.id}`,
    publishedAt: '2026-10-17T10:00:00.000Z',
    clusterId: null,
    importance: 1,
    ...over,
  };
}

describe('pickFrontPage', () => {
  test('leads with the story the most outlets carry, then the newest', () => {
    const picked = pickFrontPage([
      c({ id: 'a', importance: 2, sectionSlug: 'news.pakistan' }),
      c({ id: 'b', importance: 6, sectionSlug: 'sports.cricket' }),
      c({ id: 'c', importance: 2, sectionSlug: 'technical.cs', publishedAt: '2026-10-17T11:00:00.000Z' }),
    ], 6);
    expect(picked.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  test('takes one story per cluster', () => {
    const picked = pickFrontPage([
      c({ id: 'a', clusterId: 'k1', importance: 5, sectionSlug: 'news.pakistan' }),
      c({ id: 'b', clusterId: 'k1', importance: 5, sectionSlug: 'news.world' }),
      c({ id: 'c', clusterId: 'k2', importance: 1, sectionSlug: 'science' }),
    ], 6);
    expect(picked.map((p) => p.id)).toEqual(['a', 'c']);
  });

  test('spreads the page across sections before it repeats one', () => {
    const picked = pickFrontPage([
      c({ id: 'n1', importance: 9, sectionSlug: 'news.pakistan' }),
      c({ id: 'n2', importance: 8, sectionSlug: 'news.world' }),
      c({ id: 's1', importance: 3, sectionSlug: 'sports.cricket' }),
      c({ id: 't1', importance: 2, sectionSlug: 'technical.cs.ai-ml' }),
    ], 4);
    expect(picked.map((p) => p.id)).toEqual(['n1', 's1', 't1', 'n2']);
  });

  test('stops at the limit and drops stories with no headline or source', () => {
    const picked = pickFrontPage([
      c({ id: 'a', headline: '  ' }),
      c({ id: 'b', sourceName: '' }),
      c({ id: 'c', sectionSlug: 'sports' }),
      c({ id: 'd', sectionSlug: 'science' }),
      c({ id: 'e', sectionSlug: 'business' }),
    ], 2);
    expect(picked).toHaveLength(2);
    expect(picked.every((p) => p.headline.trim() && p.sourceName)).toBe(true);
  });
});

describe('sectionName', () => {
  test('names the section a story sits in, the way the paper does', () => {
    expect(sectionName('sports.cricket.leagues')).toBe('Cricket');
    expect(sectionName('news.pakistan')).toBe('Pakistan');
    expect(sectionName('news')).toBe('World & Pakistan');
  });

  test('falls back to plain News for a slug it does not know', () => {
    expect(sectionName('nonsense.topic')).toBe('News');
  });
});

describe('agoLabel', () => {
  test('says how long ago, in the paper\'s short form', () => {
    expect(agoLabel('2026-10-17T11:58:00.000Z', NOW)).toBe('Just now');
    expect(agoLabel('2026-10-17T11:20:00.000Z', NOW)).toBe('40 min ago');
    expect(agoLabel('2026-10-17T07:00:00.000Z', NOW)).toBe('5h ago');
    expect(agoLabel('2026-10-15T12:00:00.000Z', NOW)).toBe('2d ago');
  });

  test('is empty for a bad or future date', () => {
    expect(agoLabel('not a date', NOW)).toBe('');
    expect(agoLabel('2026-10-17T13:00:00.000Z', NOW)).toBe('');
  });
});

describe('toStory', () => {
  test('carries the headline, source, section name and link', () => {
    const s = toStory(c({ id: 'a', headline: ' Rates hold ', sectionSlug: 'sports.cricket', importance: 4 }), NOW);
    expect(s).toEqual({
      id: 'a',
      headline: 'Rates hold',
      sourceName: 'Dawn - Home',
      section: 'Cricket',
      url: 'https://example.com/a',
      ago: '2h ago',
      outlets: 4,
    });
  });

  test('keeps only http(s) links to the original', () => {
    expect(toStory(c({ id: 'a', url: 'javascript:alert(1)' }), NOW).url).toBeNull();
    expect(toStory(c({ id: 'b', url: null }), NOW).url).toBeNull();
  });
});
