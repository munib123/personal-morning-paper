// Keyword topic mapping (wave 1 of mapTextToTopics): no model, no network.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';

const callLLM = vi.fn();
const loadTopics = vi.fn();
vi.mock('@/server/ai', () => ({ callLLM: (...args: unknown[]) => callLLM(...args) }));
vi.mock('@/server/nlp/topics', () => ({ loadTopics: (...args: unknown[]) => loadTopics(...args) }));

const { keywordTopics, mapTextToTopics } = await import('./describe');

beforeEach(() => {
  callLLM.mockReset();
  loadTopics.mockReset();
  loadTopics.mockResolvedValue(FIXTURE_TAXONOMY.map((t) => ({ ...t, embedding: null })));
});

describe('keywordTopics', () => {
  it('picks liked topics and blocks negated ones', () => {
    const r = keywordTopics('I love cricket and space but hate football', FIXTURE_TAXONOMY);
    expect(r.picks).toContain('sports.cricket');
    expect(r.picks).toContain('science.space');
    expect(r.blocked).toEqual(['sports.football']);
  });

  it('matches synonyms and the last slug segment', () => {
    expect(keywordTopics('mostly web dev these days', FIXTURE_TAXONOMY).picks).toContain('technical.cs.web-dev');
    expect(keywordTopics('the PSX and bitcoin', FIXTURE_TAXONOMY).picks).toEqual(expect.arrayContaining(['business.markets', 'business.crypto']));
    expect(keywordTopics('AI and machine learning', FIXTURE_TAXONOMY).picks).toContain('technical.cs.ai-ml');
  });

  it('matches on word boundaries only', () => {
    expect(keywordTopics('I paint on weekends', FIXTURE_TAXONOMY).picks).not.toContain('arts.visual-arts');
    expect(keywordTopics('aircraft and trains', FIXTURE_TAXONOMY).picks).not.toContain('technical.cs.ai-ml');
  });

  it('looks for a negation within the 3 tokens before a match', () => {
    expect(keywordTopics("I don't want showbiz", FIXTURE_TAXONOMY).blocked).toContain('entertainment');
    expect(keywordTopics('no politics please, but more cricket', FIXTURE_TAXONOMY).picks).toContain('sports.cricket');
    // "not" is 4 tokens before "football": too far to count.
    expect(keywordTopics('not into it at all football', FIXTURE_TAXONOMY).picks).toContain('sports.football');
  });

  it('caps picks at 8 and blocked at 5', () => {
    const many = keywordTopics(
      'cricket football tennis motorsport film music gaming travel fashion food crypto space physics',
      FIXTURE_TAXONOMY,
    );
    expect(many.picks).toHaveLength(8);
    const blocked = keywordTopics(
      'no cricket, no football, no tennis, no motorsport, no film, no music, no gaming',
      FIXTURE_TAXONOMY,
    );
    expect(blocked.blocked).toHaveLength(5);
  });
});

describe('mapTextToTopics', () => {
  it('mapTextToTopics returns keyword results', async () => {
    // callLLM falls back (no key, quota, timeout): the keyword result is the answer.
    callLLM.mockImplementation(async (_s: string, _i: unknown, _schema: unknown, opts: { fallback: () => unknown }) => ({
      output: opts.fallback(),
      provider: 'fallback',
      model: null,
      cached: false,
    }));
    const r = await mapTextToTopics('cricket, AI and a bit of space, no showbiz');
    expect(r.provider).toBe('keyword');
    expect(r.picks).toEqual(expect.arrayContaining(['sports.cricket', 'technical.cs.ai-ml', 'science.space']));
    expect(r.blocked).toContain('entertainment');
  });

  it('asks gemini on the fast ladder with a 6 s deadline and the slug list (stretch S1)', async () => {
    callLLM.mockResolvedValue({ output: { picks: ['sports.cricket'], blocked: [] }, provider: 'gemini', model: 'fast-test', cached: false });
    await mapTextToTopics('cricket please');
    const [step, input, , opts] = callLLM.mock.calls[0];
    expect(step).toBe('describe');
    expect(opts).toMatchObject({ model: 'fast', timeoutMs: 6_000 });
    expect(input.instructions).toContain('technical.cs.web-dev');
    expect(input.prompt).toContain('cricket please');
  });

  it('mapTextToTopics drops invalid gemini slugs', async () => {
    callLLM.mockResolvedValue({
      output: { picks: ['sports.cricket', 'sports.fake', 'sports.cricket'], blocked: ['entertainment.pakistani-showbiz', 'x.y'] },
      provider: 'gemini',
      model: 'fast-test',
      cached: false,
    });
    await expect(mapTextToTopics('cricket, no celebrity gossip')).resolves.toEqual({
      picks: ['sports.cricket'],
      blocked: ['entertainment.pakistani-showbiz'],
      provider: 'gemini',
    });
  });

  it('caps gemini picks at 8 and blocked at 5', async () => {
    const slugs = FIXTURE_TAXONOMY.map((t) => t.slug);
    callLLM.mockResolvedValue({ output: { picks: slugs.slice(0, 12), blocked: slugs.slice(20, 30) }, provider: 'gemini', model: 'fast-test', cached: false });
    const r = await mapTextToTopics('everything');
    expect(r.picks).toHaveLength(8);
    expect(r.blocked).toHaveLength(5);
  });

  it('uses keyword when gemini returns nothing valid', async () => {
    callLLM.mockResolvedValue({ output: { picks: ['nope'], blocked: [] }, provider: 'gemini', model: 'fast-test', cached: false });
    const r = await mapTextToTopics('I love cricket');
    expect(r).toMatchObject({ provider: 'keyword' });
    expect(r.picks).toContain('sports.cricket');
  });

  it('never throws', async () => {
    callLLM.mockRejectedValue(new Error('caller bug'));
    await expect(mapTextToTopics('cricket')).resolves.toMatchObject({ provider: 'keyword', picks: ['sports.cricket'] });
    loadTopics.mockRejectedValue(new Error('db down'));
    await expect(mapTextToTopics('cricket')).resolves.toEqual({ picks: [], blocked: [], provider: 'keyword' });
  });
});
