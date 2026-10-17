import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type Query, type Result } from '@/server/learn/__fixtures__/fakeSupabase';

let resolver: (q: Query) => Result | undefined = () => undefined;
const calls: Query[] = []; // every query of the test, across admin clients
vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () =>
    fakeSupabase((q) => {
      calls.push(q);
      return resolver(q);
    }).client as never,
}));

const row = (i: number, p: Record<string, unknown> = {}) => ({
  id: `a${i}`,
  embedding: '[0.6,0.8]',
  labels: [{ slug: 'sports.cricket', conf: 0.9 }],
  cluster_id: `k${i}`,
  published_at: '2026-10-16T20:00:00Z',
  source_id: 'dawn',
  word_count: 420,
  image_url: i % 2 ? 'https://img/x.jpg' : null,
  headline: `Headline ${i}`,
  title: `Title ${i}`,
  clusters: { importance: 0.6, source_count: 4 },
  sources: { quality: 0.8 },
  ...p,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));
const gteOf = (q: Query) => q.filters.find(([f, c]) => f === 'gte' && c === 'published_at')?.[2];
const NOW = new Date('2026-10-17T02:00:00Z');

async function freshModule() {
  vi.resetModules();
  return import('./pool');
}

beforeEach(() => {
  resolver = () => ({ data: rows(80) });
  calls.length = 0;
});

describe('loadCandidatePool', () => {
  it('reads enriched|fallback articles of the last 36 h, newest first, at most 1500', async () => {
    const { loadCandidatePool } = await freshModule();
    const pool = await loadCandidatePool(NOW);
    expect(pool).toHaveLength(80);
    const q = calls[0];
    expect(q.table).toBe('articles');
    expect(q.filters).toContainEqual(['in', 'status', ['enriched', 'fallback']]);
    expect(gteOf(q)).toBe('2026-10-15T14:00:00.000Z');
    expect(q.order[0][0]).toBe('published_at');
    expect(q.limit).toBe(1500);
  });

  it('pool cache: the same now twice → 1 query; now + 1 day → a second query (Review Focus 4)', async () => {
    const { loadCandidatePool } = await freshModule();
    let n = 0;
    resolver = () => {
      n++;
      return { data: rows(80) };
    };
    await loadCandidatePool(NOW);
    await loadCandidatePool(new Date(NOW.getTime() + 5 * 60_000)); // within 10 min
    expect(n).toBe(1);
    await loadCandidatePool(new Date(NOW.getTime() + 86_400_000));
    expect(n).toBe(2);
  });

  it('pool widens to 7 days when the 36 h window has fewer than 60 rows', async () => {
    const { loadCandidatePool } = await freshModule();
    resolver = (q) => (gteOf(q) === '2026-10-15T14:00:00.000Z' ? { data: rows(12) } : { data: rows(90) });
    const pool = await loadCandidatePool(NOW);
    expect(calls).toHaveLength(2);
    expect(gteOf(calls[1])).toBe('2026-10-10T02:00:00.000Z');
    expect(pool).toHaveLength(90);
  });

  it('a DB error throws', async () => {
    const { loadCandidatePool } = await freshModule();
    resolver = () => ({ error: { message: 'timeout' } });
    await expect(loadCandidatePool(NOW)).rejects.toThrow(/timeout/);
  });
});

describe('rowToCandidate', () => {
  it('fills sourceQuality, sourceCount, importance, hasImage and headline', async () => {
    const { rowToCandidate } = await freshModule();
    const c = rowToCandidate(row(1));
    expect(c).toMatchObject({ id: 'a1', sourceQuality: 0.8, sourceCount: 4, importance: 0.6, hasImage: true, headline: 'Headline 1', clusterId: 'k1', wordCount: 420 });
    expect(Array.from(c.embedding!)).toEqual([expect.closeTo(0.6, 6), expect.closeTo(0.8, 6)]);
  });

  it('defaults: null headline → title, no cluster → importance 0 and 1 source, no source quality → 0.5', async () => {
    const { rowToCandidate } = await freshModule();
    const c = rowToCandidate(row(2, { headline: null, clusters: null, sources: null, embedding: null, labels: 'junk' }));
    expect(c).toMatchObject({ headline: 'Title 2', importance: 0, sourceCount: 1, sourceQuality: 0.5, embedding: null, labels: [], hasImage: false });
  });
});
