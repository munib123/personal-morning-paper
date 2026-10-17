import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { TasteCardSchema } from '@/contracts/api';
import { FIXTURE_TASTE_CARDS, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { rootOf } from '@/contracts/taxonomy';
import { parsePicks, pickTasteCards, type TasteCandidate } from './taste';

const adminMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/server/db/admin', () => ({ createSupabaseAdminClient: adminMock.create }));
vi.mock('./taxonomy', async () => {
  const { FIXTURE_TAXONOMY: taxonomy } = await import('@/contracts/fixtures');
  return { getTaxonomy: async () => taxonomy };
});

const tax = FIXTURE_TAXONOMY;
const Cards = z.array(TasteCardSchema);
const WILD = [2, 5];

// 20 candidates over 5 roots: 4 each, descending importance inside a root; ai-ml and cricket share no clusters.
function pool(): TasteCandidate[] {
  const specs: [string, number][] = [
    ['technical.cs.ai-ml', 4], ['sports.cricket', 4], ['science.space', 4], ['business.markets', 4], ['arts.books-literature', 4],
  ];
  const out: TasteCandidate[] = [];
  let n = 0;
  for (const [slug, count] of specs) {
    for (let i = 0; i < count; i++) {
      n++;
      out.push({
        articleId: `a${n}`,
        headline: `${slug} story ${i}`,
        sourceName: `Source ${n % 3}`,
        labels: [{ slug, conf: 0.7 }],
        imageUrl: i === 0 ? `https://img.example/${n}.jpg` : null,
        clusterId: `c${n}`,
        importance: 0.9 - i * 0.1 - (n % 5) * 0.01,
        publishedAt: `2026-10-17T0${i}:00:00.000Z`,
      });
    }
  }
  return out;
}

describe('pickTasteCards', () => {
  test('6 matched, alternating between the picks, and 2 wildcards at 2 and 5', () => {
    const picks = ['technical.cs.ai-ml', 'sports.cricket'];
    const cards = pickTasteCards(pool(), picks, tax, FIXTURE_TASTE_CARDS);
    expect(cards).toHaveLength(8);
    expect(Cards.parse(cards)).toEqual(cards);
    expect(cards.map((c, i) => [i, c.wildcard]).filter(([, w]) => w).map(([i]) => i)).toEqual(WILD);
    for (const i of WILD) expect(['technical', 'sports']).not.toContain(rootOf(cards[i].topicSlug));
    expect(rootOf(cards[2].topicSlug)).not.toBe(rootOf(cards[5].topicSlug));
    const matched = cards.filter((c) => !c.wildcard);
    expect(matched.map((c) => c.topicSlug)).toEqual([
      'technical.cs.ai-ml', 'sports.cricket', 'technical.cs.ai-ml', 'sports.cricket', 'technical.cs.ai-ml', 'sports.cricket',
    ]);
    expect(new Set(cards.map((c) => c.articleId)).size).toBe(8);
    expect(cards[0].topicName).toBe('AI & Machine Learning');
    expect(cards[0].headline).toBe('technical.cs.ai-ml story 0');
  });

  test('never repeats a cluster', () => {
    const p = pool().map((c, i) => ({ ...c, clusterId: c.labels[0].slug === 'sports.cricket' ? 'same-cricket-story' : `c${i}` }));
    const cards = pickTasteCards(p, ['sports.cricket'], tax, FIXTURE_TASTE_CARDS);
    expect(cards).toHaveLength(8);
    const fromPool = cards.filter((c) => c.topicSlug === 'sports.cricket' && c.headline.startsWith('sports.cricket'));
    expect(fromPool).toHaveLength(1);
  });

  test('falls back to labels beyond the first, then to the fixture cards', () => {
    const p: TasteCandidate[] = [
      { articleId: 'x1', headline: 'Second-label match', sourceName: 'S', labels: [{ slug: 'news', conf: 0.6 }, { slug: 'sports.cricket.pakistan', conf: 0.4 }], imageUrl: null, clusterId: null, importance: 0.5, publishedAt: '2026-10-17T00:00:00.000Z' },
    ];
    const cards = pickTasteCards(p, ['sports.cricket'], tax, FIXTURE_TASTE_CARDS);
    expect(cards).toHaveLength(8);
    expect(cards[0].articleId).toBe('x1');
    expect(cards[0].wildcard).toBe(false);
    expect(cards.map((c) => c.wildcard)).toEqual([false, false, true, false, false, true, false, false]);
  });

  test('an empty pool gives the 8 fixture cards', () => {
    const cards = pickTasteCards([], ['technical.cs.ai-ml', 'sports.cricket'], tax, FIXTURE_TASTE_CARDS);
    expect(cards).toHaveLength(8);
    const fixtureIds = new Set(FIXTURE_TASTE_CARDS.map((c) => c.articleId));
    for (const c of cards) expect(fixtureIds.has(c.articleId)).toBe(true);
    expect(new Set(cards.map((c) => c.articleId)).size).toBe(8);
    expect(cards.filter((c) => c.wildcard)).toHaveLength(2);
  });

  test('no picks or only unknown picks use the default topics', () => {
    for (const picks of [[], ['zzz.unknown']]) {
      const cards = pickTasteCards(pool(), picks, tax, FIXTURE_TASTE_CARDS);
      expect(cards).toHaveLength(8);
      expect(Cards.parse(cards)).toEqual(cards);
      for (const i of WILD) expect(['news', 'technical', 'sports', 'business']).not.toContain(rootOf(cards[i].topicSlug));
    }
  });

  test('a topic name falls back to the slug when the taxonomy lacks it', () => {
    const p = [{ ...pool()[0], labels: [{ slug: 'technical.cs.quantum', conf: 0.9 }] }];
    const cards = pickTasteCards(p, ['technical.cs'], tax, FIXTURE_TASTE_CARDS);
    expect(cards[0].topicName).toBe('technical.cs.quantum');
  });
});

describe('parsePicks', () => {
  test('keeps clean slugs, de-duplicated, at most 20', () => {
    expect(parsePicks('a,../x,,technical.cs.ai-ml,a')).toEqual(['a', 'technical.cs.ai-ml']);
    expect(parsePicks(null)).toEqual([]);
    expect(parsePicks('')).toEqual([]);
    expect(parsePicks(Array.from({ length: 500 }, (_, i) => `t${i}`).join(','))).toHaveLength(20);
  });
});

describe('getTasteCards', () => {
  beforeEach(() => { adminMock.create.mockReset(); });

  test('serves the fixture cards when the database is unreachable', async () => {
    adminMock.create.mockImplementation(() => { throw new Error('no env'); });
    const { getTasteCards } = await import('./taste');
    const cards = await getTasteCards(['technical.cs.ai-ml']);
    expect(cards).toHaveLength(8);
    expect(Cards.parse(cards)).toEqual(cards);
    expect(cards.filter((c) => c.wildcard)).toHaveLength(2);
  });

  test('maps enriched rows from the last 72 h', async () => {
    const rows = [
      { id: 'r1', headline: null, title: 'Plain title', labels: [{ slug: 'technical.cs.ai-ml', conf: 0.8 }], image_url: null, cluster_id: 'k1', published_at: '2026-10-17T03:00:00.000Z', sources: { name: 'Dawn' }, clusters: { importance: 0.7 } },
      { id: 'r2', headline: 'Bad labels', title: 'x', labels: 'nope', image_url: null, cluster_id: null, published_at: '2026-10-17T03:00:00.000Z', sources: null, clusters: null },
    ];
    const calls: Record<string, unknown[]> = {};
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    for (const m of ['select', 'in', 'gte', 'order']) chain[m] = (...a: unknown[]) => { calls[m] = a; return chain; };
    chain.limit = (...a: unknown[]) => { calls.limit = a; return Promise.resolve({ data: rows, error: null }); };
    adminMock.create.mockReturnValue({ from: (t: string) => { calls.from = [t]; return chain; } });
    const { getTasteCards } = await import('./taste');
    const cards = await getTasteCards(['technical.cs.ai-ml']);
    expect(calls.from).toEqual(['articles']);
    expect(calls.in?.[0]).toBe('status');
    expect(calls.in?.[1]).toContain('enriched');
    expect(calls.gte?.[0]).toBe('published_at');
    expect(calls.limit).toEqual([300]);
    expect(cards[0]).toEqual({ articleId: 'r1', headline: 'Plain title', sourceName: 'Dawn', topicSlug: 'technical.cs.ai-ml', topicName: 'AI & Machine Learning', imageUrl: null, wildcard: false });
    expect(cards.some((c) => c.articleId === 'r2')).toBe(false);
    expect(cards).toHaveLength(8);
  });
});
