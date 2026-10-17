import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DescribeResponseSchema } from '@/contracts/api';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { keywordTopics } from '@/components/onboarding/lib/keywords';
import { POST } from './route';

const enrich = vi.hoisted(() => ({ mapTextToTopics: vi.fn() }));
vi.mock('@/server/enrich', () => ({ mapTextToTopics: enrich.mapTextToTopics }));
vi.mock('@/server/onboarding', async () => {
  const { FIXTURE_TAXONOMY: taxonomy } = await import('@/contracts/fixtures');
  return { getTaxonomy: async () => taxonomy };
});

const known = new Set(FIXTURE_TAXONOMY.map((n) => n.slug));
const post = (body: unknown, raw = false) =>
  POST(new Request('http://localhost/api/onboarding/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: raw ? (body as string) : JSON.stringify(body),
  }));

beforeEach(() => { enrich.mapTextToTopics.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('POST /api/onboarding/describe', () => {
  test('passes the model result through, minus slugs outside the taxonomy', async () => {
    enrich.mapTextToTopics.mockResolvedValue({
      picks: ['technical.cs', 'sports.cricket', 'made.up', 'sports.cricket'],
      blocked: ['news.pakistan.politics', 'not-a-topic'],
      provider: 'gemini',
    });
    const res = await post({ text: 'CS student into cricket, hates politics' });
    expect(res.status).toBe(200);
    const body = DescribeResponseSchema.parse(await res.json());
    expect(body).toEqual({ picks: ['technical.cs', 'sports.cricket'], blocked: ['news.pakistan.politics'], provider: 'gemini' });
    for (const s of [...body.picks, ...body.blocked]) expect(known.has(s)).toBe(true);
    expect(enrich.mapTextToTopics).toHaveBeenCalledWith('CS student into cricket, hates politics');
  });

  test('rejects an empty, oversized or malformed body with a 400', async () => {
    for (const body of [{ text: '' }, { text: '   ' }, { text: 'x'.repeat(5000) }, {}, { text: 42 }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect((await post('{not json', true)).status).toBe(400);
    expect(enrich.mapTextToTopics).not.toHaveBeenCalled();
  });

  test('falls back to keywords when the model throws', async () => {
    enrich.mapTextToTopics.mockRejectedValue(new Error('429'));
    const text = 'more cricket, less celebrity gossip';
    const res = await post({ text });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...keywordTopics(text, FIXTURE_TAXONOMY), provider: 'keyword' });
  });

  test('falls back to keywords when the model returns nothing usable', async () => {
    const text = 'more cricket, less celebrity gossip';
    for (const result of [
      { picks: [], blocked: [], provider: 'keyword' },
      { picks: ['made.up'], blocked: [], provider: 'gemini' },
      { nonsense: true },
      undefined,
    ]) {
      enrich.mapTextToTopics.mockResolvedValue(result);
      const body = await (await post({ text })).json();
      expect(body.provider).toBe('keyword');
      expect(body.picks).toContain('sports.cricket');
      expect(body.blocked).toEqual(['entertainment.pakistani-showbiz']);
    }
  });

  test("when L2 answers from its own keyword matcher, L5's matcher answers (it understands 'less')", async () => {
    const text = 'more cricket, less celebrity gossip';
    enrich.mapTextToTopics.mockResolvedValue({ picks: ['sports.cricket', 'entertainment.pakistani-showbiz'], blocked: [], provider: 'keyword' });
    const body = await (await post({ text })).json();
    expect(body).toEqual({ ...keywordTopics(text, FIXTURE_TAXONOMY), provider: 'keyword' });
    expect(body.blocked).toEqual(['entertainment.pakistani-showbiz']);
    expect(body.picks).not.toContain('entertainment.pakistani-showbiz');
  });

  test('falls back to keywords when the model is too slow', async () => {
    vi.useFakeTimers();
    enrich.mapTextToTopics.mockReturnValue(new Promise(() => {}));
    const pending = post({ text: 'cricket' });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('keyword');
  });

  test('a burst from one address stops reaching the model but still answers', async () => {
    enrich.mapTextToTopics.mockResolvedValue({ picks: ['sports.cricket'], blocked: [], provider: 'gemini' });
    const from = (ip: string) => POST(new Request('http://localhost/api/onboarding/describe', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ text: 'cricket' }),
    }));
    const providers: string[] = [];
    for (let i = 0; i < 25; i++) providers.push((await (await from('203.0.113.7')).json()).provider);
    expect(providers.slice(0, 5).every((p) => p === 'gemini')).toBe(true);
    expect(providers.at(-1)).toBe('keyword');
    expect(enrich.mapTextToTopics.mock.calls.length).toBeLessThan(25);
  });
});
