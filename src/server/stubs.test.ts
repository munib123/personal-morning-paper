// L0 smoke test for the §9.3 server stubs. Each owner deletes or adapts the case for their module when replacing its stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SIGNAL_TYPES } from '@/contracts/signals';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { callLLM, geminiStatus } from '@/server/ai';
import { __setUsageStore } from '@/server/ai/usage';
import { buildEdition, getEdition } from '@/server/edition';
import { writeEditorNote, type EditorNoteInput } from '@/server/enrich';
import { DEFAULT_PARAMS, RANK_VERSION } from '@/server/rank';


afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('ai (L2) with no Gemini key and no database', () => {
  // The real geminiStatus() reads today's llm_usage row through Supabase. CI only has a placeholder
  // project, where that read retries for seconds, so these cases run against an in-memory store.
  const usage = new Map<string, number>();
  beforeEach(() => {
    usage.clear();
    __setUsageStore({
      get: async (day, model) => usage.get(`${day}|${model}`) ?? 0,
      add: async (day, model, d) => {
        const n = (usage.get(`${day}|${model}`) ?? 0) + d.requests;
        usage.set(`${day}|${model}`, n);
        return n;
      },
    });
  });
  afterEach(() => __setUsageStore(null));

  it('callLLM returns the fallback without calling fetch', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('fetch must not be called')));
    const fallback = vi.fn(() => ({ note: 'template note' }));
    const res = await callLLM('editor_note', { instructions: 'i', prompt: 'p' }, z.object({ note: z.string() }), { fallback, model: 'smart' });
    expect(res).toEqual({ output: { note: 'template note' }, provider: 'fallback', model: null, cached: false });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('geminiStatus is missing without a key and ok with one', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(geminiStatus()).resolves.toBe('missing');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    await expect(geminiStatus()).resolves.toBe('ok');
  });
});

describe('rank stub (L3)', () => {
  it('DEFAULT_PARAMS has a numeric reward for every SignalType and topic weight 0.4', () => {
    expect(DEFAULT_PARAMS.version).toBe(RANK_VERSION);
    expect(RANK_VERSION).toBe('rank-v1');
    for (const t of SIGNAL_TYPES) expect(Number.isFinite(DEFAULT_PARAMS.rewards[t]), t).toBe(true);
    expect(Object.keys(DEFAULT_PARAMS.rewards).sort()).toEqual([...SIGNAL_TYPES].sort());
    expect(DEFAULT_PARAMS.weights.topic).toBe(0.4);
  });
});

// L3 replaced its stub (adapted by L3): real readers hit Supabase (covered in src/server/edition); the
// fixture reader (FIXTURE_USER_ID) keeps the L0 fixtures, so other lanes' stub pages keep rendering.
describe('edition (L3) fixture mode', () => {
  it('buildEdition resolves to an edition with 20 items', async () => {
    const edition = await buildEdition(FIXTURE_USER_ID, new Date('2026-10-17T02:00:00Z'));
    expect(edition.items).toHaveLength(20);
  });

  it('getEdition resolves the fixture for 2026-10-17 and null for any other date', async () => {
    await expect(getEdition(FIXTURE_USER_ID, '1999-01-01')).resolves.toBeNull();
    expect((await getEdition(FIXTURE_USER_ID, '2026-10-17'))?.date).toBe('2026-10-17');
  });
});

describe('enrich stub (L2)', () => {
  const headlines = [{ headline: 'PSX hits record high', section: 'business' }, ...Array.from({ length: 19 }, (_, i) => ({ headline: `Story ${i + 2}`, section: 'news' }))];
  const base: EditorNoteInput = { paperName: 'The Morrow', displayName: 'Ayesha Khan', date: '2026-10-17', number: 3, headlines, movers: [], streak: 6 };

  it('writeEditorNote returns the §9.7 template', async () => {
    const movers = [
      { slug: 'sports.cricket', name: 'Cricket', before: 0.4, after: 0.6 },
      { slug: 'technical.ai', name: 'AI & Machine Learning', before: 0.5, after: 0.6 },
      { slug: 'entertainment.showbiz', name: 'Pakistani Showbiz', before: 0.5, after: 0.3 },
    ];
    await expect(writeEditorNote({ ...base, movers, preferSmart: true })).resolves.toEqual({
      text: 'Good morning, Ayesha. Edition No. 3: 20 stories, led by "PSX hits record high". More Cricket and AI & Machine Learning, less Pakistani Showbiz, based on what you read.',
      source: 'template',
    });
    await expect(writeEditorNote({ ...base, displayName: null, number: 1 })).resolves.toEqual({
      text: 'Good morning. Edition No. 1: 20 stories, led by "PSX hits record high".',
      source: 'template',
    });
  });
});
