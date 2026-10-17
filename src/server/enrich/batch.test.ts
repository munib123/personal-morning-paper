// Batch enrichment with a stubbed callLLM and an in-memory cache: no real model, no network, no DB.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { PSX_ITEM, PSX_SOURCE } from './__fixtures__/articles';
import type { EnrichmentItem } from './schema';
import type { EnrichCandidate } from './select';

const callLLM = vi.fn();
const cache = new Map<string, unknown>();

vi.mock('@/server/ai', () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
  getLlmCallCount: () => 0,
  cacheKeyFor: (step: string, model: string, key: string) => `${step}|${model}|${key}`,
  getCached: async (key: string) => cache.get(key),
  putCached: async (key: string, _step: string, _provider: string, output: unknown) => {
    cache.set(key, output);
  },
  resolveModel: (tier: string) => ({ id: `${tier}-test`, model: {} }),
}));

const { enrichAll, enrichBatch, toStoredRecall } = await import('./batch');
const { ENRICH_INSTRUCTIONS } = await import('./prompt');

const SLUGS = FIXTURE_TAXONOMY.map((t) => t.slug);

function cand(i: number): EnrichCandidate {
  return {
    id: `art-${i}`,
    urlHash: `hash-${i}`,
    clusterId: `cluster-${i}`,
    sourceName: 'Dawn',
    sourceQuality: 0.8,
    wordCount: 180,
    publishedAt: new Date('2026-10-17T04:00:00Z'),
    importance: 0.5,
    labels: [{ slug: 'business.markets', conf: 1 }],
    title: PSX_SOURCE.title,
    lede: null,
    contentText: PSX_SOURCE.text,
  };
}
const batchOf = (from: number, count: number) => Array.from({ length: count }, (_, k) => cand(from + k));

/** The short ids (a1, a2, …) in a batch prompt. */
const idsIn = (prompt: string) => [...prompt.matchAll(/<article id="(a\d+)"/g)].map((m) => m[1]);
const good = (id: string): EnrichmentItem => ({ ...structuredClone(PSX_ITEM), id });
const fourOptions = (id: string): EnrichmentItem => ({ ...good(id), recall: { ...PSX_ITEM.recall, options: ['1,250', '980', '640', '18'] } });

/** callLLM answers every article of the prompt, with `edit` applied per short id. */
function answer(edit: (id: string, item: EnrichmentItem) => EnrichmentItem | null = (_, it) => it) {
  callLLM.mockImplementation(async (_step: string, input: { prompt: string }) => ({
    output: { items: idsIn(input.prompt).flatMap((id) => edit(id, good(id)) ?? []) },
    provider: 'gemini',
    model: 'fast-test',
    cached: false,
  }));
}

beforeEach(() => {
  callLLM.mockReset();
  cache.clear();
});

describe('enrichBatch', () => {
  it('enrichBatch isolates a bad item', async () => {
    answer((id, it) => (id === 'a4' ? fourOptions(id) : it));
    const out = await enrichBatch(batchOf(1, 10), SLUGS);
    expect(out.filter((o) => o.kind === 'enriched')).toHaveLength(9);
    expect(out.filter((o) => o.kind === 'retry').map((o) => o.id)).toEqual(['art-4']);
    expect(out.find((o) => o.id === 'art-1')!.provider).toBe('gemini:fast-test');

    cache.clear(); // same batch again (otherwise the 9 cached articles drop out and the short ids shift)
    const final = await enrichBatch(batchOf(1, 10), SLUGS, { final: true });
    const bad = final.find((o) => o.id === 'art-4')!;
    expect(bad).toMatchObject({ kind: 'fallback', attempted: true, provider: 'extractive' });
    expect(bad.fields.recall).toBeNull();
  });

  it('final pass keeps summaries and uses the title on a voice failure', async () => {
    answer((id, it) => {
      if (id === 'a1') return { ...it, headline: 'Will PSX hit a record?' };
      if (id === 'a2') return { ...fourOptions(id), headline: 'Will PSX hit a record?' };
      return it;
    });
    const first = await enrichBatch(batchOf(1, 3), SLUGS);
    expect(first.find((o) => o.id === 'art-1')!.kind).toBe('retry');

    cache.clear();
    const final = await enrichBatch(batchOf(1, 3), SLUGS, { final: true });
    const voice = final.find((o) => o.id === 'art-1')!;
    expect(voice.kind).toBe('enriched');
    expect(voice.fields.headline).toBe(PSX_SOURCE.title);
    expect(voice.fields.summary_std).toBe(PSX_ITEM.summary_std);
    expect(final.find((o) => o.id === 'art-2')!.kind).toBe('fallback');
  });

  it('enrich instructions carry the Morrow headline voice', () => {
    const text = ENRICH_INSTRUCTIONS(SLUGS);
    expect(text.startsWith('You are the copy desk of a personal morning newspaper.')).toBe(true);
    for (const phrase of ['states what happened', 'sentence case', 'no questions', 'no exclamation marks', 'no emoji']) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).toContain('technical.cs.web-dev');
    expect(text).toContain('{"items":[...]}');
  });

  it('enrich instructions keep features, guides and tutorials usable', () => {
    // The first real run lost 29 long dev tutorials and features to usable=false ("not news").
    const text = ENRICH_INSTRUCTIONS(SLUGS);
    for (const phrase of ['features', 'reviews', 'guides', 'tutorials', 'are usable']) expect(text, phrase).toContain(phrase);
  });

  it('enrichBatch marks a missing id for re-batch', async () => {
    callLLM.mockImplementation(async (_step: string, input: { prompt: string }) => {
      const ids = idsIn(input.prompt).filter((id) => id !== 'a3');
      return { output: { items: [...ids.map(good), fourOptions('a2')] }, provider: 'gemini', model: 'fast-test', cached: false };
    });
    const out = await enrichBatch(batchOf(1, 5), SLUGS);
    expect(out.find((o) => o.id === 'art-3')!.kind).toBe('retry');
    expect(out.find((o) => o.id === 'art-2')!.kind).toBe('enriched'); // the first copy of a2 wins
    expect(out).toHaveLength(5);
  });

  it('enrichBatch falls back without retries when Gemini is unavailable', async () => {
    callLLM.mockResolvedValue({ output: { items: [] }, provider: 'fallback', model: null, cached: false });
    const out = await enrichBatch(batchOf(1, 10), SLUGS);
    expect(out).toHaveLength(10);
    expect(out.every((o) => o.kind === 'fallback' && o.attempted === false && o.provider === 'extractive')).toBe(true);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it('usable:false → unusable', async () => {
    answer((id, it) => (id === 'a1' ? { ...it, usable: false } : it));
    const out = await enrichBatch(batchOf(1, 2), SLUGS);
    expect(out.find((o) => o.id === 'art-1')).toMatchObject({ kind: 'unusable', provider: 'gemini:fast-test' });
  });

  it('per-article cache hit skips the call', async () => {
    for (const c of batchOf(1, 10)) cache.set(`enrich|fast-test|${c.urlHash}`, good('cached'));
    const out = await enrichBatch(batchOf(1, 10), SLUGS);
    expect(callLLM).not.toHaveBeenCalled();
    expect(out.filter((o) => o.kind === 'enriched')).toHaveLength(10);
    expect(out[0].provider).toBe('gemini:fast-test');
  });

  it('caches every item that passes, per article, under the model that answered', async () => {
    answer((id, it) => (id === 'a2' ? fourOptions(id) : it));
    await enrichBatch(batchOf(1, 2), SLUGS);
    expect(cache.has('enrich|fast-test|hash-1')).toBe(true);
    expect(cache.has('enrich|fast-test|hash-2')).toBe(false);
  });

  it('sends one fast callLLM per batch with the batch cache key and a 120 s deadline', async () => {
    answer();
    await enrichBatch(batchOf(1, 3), SLUGS);
    expect(callLLM).toHaveBeenCalledTimes(1);
    const [step, , , opts] = callLLM.mock.calls[0];
    expect(step).toBe('enrich');
    expect(opts).toMatchObject({ model: 'fast', timeoutMs: 120_000, cacheKey: 'batch:hash-1,hash-2,hash-3' });
    expect(opts.fallback()).toEqual({ items: [] });
  });
});

describe('enrichAll', () => {
  it('enrichAll re-batches every retry once', async () => {
    // Each first-pass batch has one bad article (its first); the re-batch answers well.
    let calls = 0;
    callLLM.mockImplementation(async (_step: string, input: { prompt: string }) => {
      calls++;
      const ids = idsIn(input.prompt);
      const items = ids.map((id) => (calls <= 2 && id === 'a1' ? fourOptions(id) : good(id)));
      return { output: { items }, provider: 'gemini', model: 'fast-test', cached: false };
    });
    const out = await enrichAll(batchOf(1, 20), SLUGS);
    expect(callLLM).toHaveBeenCalledTimes(3);
    expect(idsIn(callLLM.mock.calls[2][1].prompt)).toHaveLength(2);
    expect(out).toHaveLength(20);
    expect(out.some((o) => o.kind === 'retry')).toBe(false);
    expect(out.filter((o) => o.kind === 'enriched')).toHaveLength(20);
  });

  it('sends a second failure to extractive', async () => {
    answer((id, it) => (id === 'a1' ? fourOptions(id) : it));
    const out = await enrichAll(batchOf(1, 3), SLUGS);
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(out.find((o) => o.id === 'art-1')).toMatchObject({ kind: 'fallback', attempted: true });
  });
});

describe('toStoredRecall', () => {
  it('stores recall camelCase', () => {
    const stored = toStoredRecall({ question: 'q', options: ['a', 'b', 'c'], answer_index: 1, explanation: 'e' });
    expect(stored).toEqual({ question: 'q', options: ['a', 'b', 'c'], answerIndex: 1, explanation: 'e' });
    expect(stored).not.toHaveProperty('answer_index');
  });
});
