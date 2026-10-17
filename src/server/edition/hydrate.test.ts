import { describe, expect, it } from 'vitest';
import { ArticleCardSchema } from '@/contracts/api';
import type { EditionItem } from '@/contracts/edition';
import { FIXTURE_EDITION, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { sectionNamesFor, toArticleCard, type ArticleRow } from './hydrate';

const row = (p: Partial<ArticleRow> = {}): ArticleRow => ({
  id: 'a1',
  url: 'https://www.dawn.com/news/1',
  source_id: 'dawn',
  title: 'Pakistan beat England in Multan',
  headline: 'Pakistan win the series',
  lede: 'Lede text.',
  summary_brief: 'Brief.',
  summary_std: 'Standard summary.',
  summary_deep: 'Deep summary.',
  why_it_matters: 'Why.',
  key_fact: 'Fact.',
  image_url: 'https://img/1.jpg',
  published_at: '2026-10-16T20:00:00+00:00',
  word_count: 690,
  labels: [{ slug: 'sports.cricket.pakistan', conf: 0.9 }],
  cluster_id: 'k1',
  enrich_provider: 'gemini:gemini-3.5-flash-lite',
  recall: { question: 'Who won?', options: ['Pakistan', 'England', 'Draw'], answerIndex: 0, explanation: 'Pakistan won by 7 wickets.' },
  ur: null,
  sources: { name: 'Dawn', homepage: 'https://www.dawn.com', url: 'https://www.dawn.com/feeds/home' },
  ...p,
});

describe('toArticleCard', () => {
  it('maps a full row to a valid ArticleCard', () => {
    const card = toArticleCard(row(), ['Geo News', 'Dawn', 'Geo News', 'ARY']);
    expect(ArticleCardSchema.safeParse(card).success).toBe(true);
    expect(card).toMatchObject({
      id: 'a1',
      sourceName: 'Dawn',
      sourceDomain: 'dawn.com',
      headline: 'Pakistan win the series',
      summary: { brief: 'Brief.', std: 'Standard summary.', deep: 'Deep summary.' },
      readingMinutes: 3,
      aiProvider: 'gemini',
      alsoCoveredBy: ['Geo News', 'ARY'],
      recall: { articleId: 'a1', answerIndex: 0, options: ['Pakistan', 'England', 'Draw'] },
      publishedAt: '2026-10-16T20:00:00.000Z',
    });
  });

  it('fallbacks: null headline → title, null summary_deep → summary_std, empty summaries → lede → title', () => {
    const a = toArticleCard(row({ headline: null, summary_deep: null }), []);
    expect(a.headline).toBe('Pakistan beat England in Multan');
    expect(a.summary.deep).toBe('Standard summary.');
    const b = toArticleCard(row({ summary_brief: null, summary_std: null, summary_deep: null }), []);
    expect(b.summary).toEqual({ brief: 'Lede text.', std: 'Lede text.', deep: 'Lede text.' });
    const c = toArticleCard(row({ summary_brief: null, summary_std: null, summary_deep: null, lede: null }), []);
    expect(c.summary.std).toBe('Pakistan beat England in Multan');
  });

  it('extractive provider, answer_index from Gemini casing, invalid recall → null, domain from the article url', () => {
    const a = toArticleCard(row({ enrich_provider: 'extractive', recall: { question: 'Q?', options: ['a', 'b', 'c'], answer_index: 2, explanation: 'E' }, sources: { name: 'Dawn', homepage: null, url: 'x' } }), []);
    expect(a.aiProvider).toBe('extractive');
    expect(a.recall?.answerIndex).toBe(2);
    expect(a.sourceDomain).toBe('dawn.com');
    expect(toArticleCard(row({ recall: { question: 'Q?', options: ['a', 'b'] } }), []).recall).toBeNull();
    expect(toArticleCard(row({ enrich_provider: null }), []).aiProvider).toBe('extractive');
  });

  it('alsoCoveredBy keeps at most 5 distinct other outlets; readingMinutes is at least 1', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect(toArticleCard(row(), many).alsoCoveredBy).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(toArticleCard(row({ word_count: 10 }), []).readingMinutes).toBe(1);
  });
});

describe('sectionNamesFor', () => {
  it('names every section slug and every label slug of items and reserve', () => {
    const items: EditionItem[] = [...FIXTURE_EDITION.items, ...FIXTURE_EDITION.reserve];
    const names = sectionNamesFor(items, FIXTURE_TAXONOMY);
    expect(names.sports).toBe('Sports');
    expect(names['sports.cricket.pakistan']).toBe('Pakistan Cricket');
    for (const it of items) {
      expect(names[it.sectionSlug]).toBeTruthy();
      for (const l of it.article.labels) expect(names[l.slug]).toBeTruthy();
    }
  });

  it('covers sports and sports.cricket for a cricket item', () => {
    const item = { ...FIXTURE_EDITION.items[0], sectionSlug: 'sports', article: { ...FIXTURE_EDITION.items[0].article, labels: [{ slug: 'sports.cricket', conf: 1 }] } };
    expect(sectionNamesFor([item], FIXTURE_TAXONOMY)).toEqual({ sports: 'Sports', 'sports.cricket': 'Cricket' });
  });
});
