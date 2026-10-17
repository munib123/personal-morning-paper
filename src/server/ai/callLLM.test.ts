// callLLM with mocked models only: never touches the network or the DB (the Gemini quota is shared).
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { __setCacheStore, cacheKeyFor } from './cache';
import { callLLM, geminiStatus, getLlmCallCount } from './index';
import { __resetLimiter, __setSleep, isLimited, nextQuotaReset } from './limiter';
import { __setModelResolver, type ModelTier } from './models';
import { __setUsageStore, pacificDay, type UsageStore } from './usage';

type DoGenerate = MockLanguageModelV4['doGenerate'];
type GenerateOptions = Parameters<DoGenerate>[0];
type GenerateResult = Awaited<ReturnType<DoGenerate>>;

const schema = z.object({ answer: z.string() });
const fallback = () => ({ answer: 'fb' });
const input = { instructions: 'Reply with JSON.', prompt: 'Say hi' };

function reply(obj: unknown): GenerateResult {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 4, text: 4, reasoning: undefined },
    },
    warnings: [],
  };
}

function quota429(quotaId = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay = '2s') {
  return new APICallError({
    message: 'quota',
    url: 'x',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
    responseBody: JSON.stringify({
      error: {
        code: 429,
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
        ],
      },
    }),
  });
}
const httpError = (statusCode: number) =>
  new APICallError({ message: `http ${statusCode}`, url: 'x', requestBodyValues: {}, statusCode, isRetryable: statusCode >= 500 });

// Never resolves; rejects with the abort reason once callLLM's deadline fires.
const hang = (o: GenerateOptions) =>
  new Promise<GenerateResult>((_, reject) => {
    o.abortSignal?.addEventListener('abort', () => reject(o.abortSignal?.reason), { once: true });
  });

let gen: Record<ModelTier, ReturnType<typeof vi.fn<DoGenerate>>>;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
let cache: Map<string, unknown>;
let usage: Map<string, number>;
let usageStore: { get: ReturnType<typeof vi.fn<UsageStore['get']>>; add: ReturnType<typeof vi.fn<UsageStore['add']>> };

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test');
  for (const t of ['FAST', 'FALLBACK', 'SMART']) vi.stubEnv(`GEMINI_RPM_${t}`, '60000');
  vi.stubEnv('GEMINI_RPD_FAST', '450');
  vi.stubEnv('GEMINI_RPD_FALLBACK', '450');
  vi.stubEnv('GEMINI_RPD_SMART', '18');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  gen = {
    smart: vi.fn<DoGenerate>(async () => reply({ answer: 'smart' })),
    fast: vi.fn<DoGenerate>(async () => reply({ answer: 'hi' })),
    fallback: vi.fn<DoGenerate>(async () => reply({ answer: 'from fallback' })),
  };
  __setModelResolver((tier) => ({
    id: `${tier}-test`,
    model: new MockLanguageModelV4({ provider: 'google', modelId: `${tier}-test`, doGenerate: (o) => gen[tier](o) }),
  }));

  cache = new Map();
  __setCacheStore({
    get: async (key) => cache.get(key),
    put: async (key, _step, _provider, output) => {
      cache.set(key, output);
    },
  });

  usage = new Map();
  usageStore = {
    get: vi.fn<UsageStore['get']>(async (day, model) => usage.get(`${day}|${model}`) ?? 0),
    add: vi.fn<UsageStore['add']>(async (day, model, d) => {
      const total = (usage.get(`${day}|${model}`) ?? 0) + d.requests;
      usage.set(`${day}|${model}`, total);
      return total;
    }),
  };
  __setUsageStore(usageStore);

  sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  __setSleep(sleep);
  __resetLimiter();
});

afterEach(() => {
  __setModelResolver(null);
  __setCacheStore(null);
  __setUsageStore(null);
  __setSleep(null);
  __resetLimiter();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const call = (cacheKey: string, model?: 'fast' | 'smart', timeoutMs?: number) =>
  callLLM('describe', input, schema, { fallback, cacheKey, ...(model ? { model } : {}), ...(timeoutMs ? { timeoutMs } : {}) });

describe('callLLM', () => {
  it('returns gemini output and caches it', async () => {
    const before = getLlmCallCount();
    await expect(call('k1')).resolves.toEqual({ output: { answer: 'hi' }, provider: 'gemini', model: 'fast-test', cached: false });
    await expect(call('k1')).resolves.toEqual({ output: { answer: 'hi' }, provider: 'gemini', model: 'fast-test', cached: true });
    expect(gen.fast).toHaveBeenCalledTimes(1);
    expect(getLlmCallCount() - before).toBe(1);
    expect(gen.fast.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('honours retryDelay once then succeeds', async () => {
    gen.fast.mockRejectedValueOnce(quota429());
    const r = await call('k2');
    expect(r).toMatchObject({ provider: 'gemini', model: 'fast-test' });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(gen.fast).toHaveBeenCalledTimes(2);
  });

  it('falls fast → fallback after a second 429', async () => {
    gen.fast.mockRejectedValue(quota429());
    const r = await call('k3');
    expect(r).toMatchObject({ provider: 'gemini', model: 'fallback-test', output: { answer: 'from fallback' } });
    expect(gen.fast).toHaveBeenCalledTimes(2);
    await expect(geminiStatus()).resolves.toBe('limited');
  });

  it('opens the breaker', async () => {
    gen.fast.mockRejectedValue(quota429());
    await call('k4a');
    expect(gen.fast).toHaveBeenCalledTimes(2);
    const r = await call('k4b');
    expect(gen.fast).toHaveBeenCalledTimes(2); // not called again
    expect(r.model).toBe('fallback-test');
  });

  it('daily 429 skips without waiting', async () => {
    gen.fast.mockRejectedValue(quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '30s'));
    const r = await call('k5');
    expect(gen.fast).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(r.model).toBe('fallback-test');
    expect(isLimited('fast-test')).toBe(true);
    expect(isLimited('fast-test', nextQuotaReset(Date.now()) - 1000)).toBe(true);
    expect(isLimited('fast-test', nextQuotaReset(Date.now()) + 1000)).toBe(false);
  });

  it('smart ladder is smart → fast → fallback', async () => {
    gen.smart.mockRejectedValue(quota429());
    gen.fast.mockRejectedValue(quota429());
    const r = await call('k6', 'smart');
    expect(r.model).toBe('fallback-test');
    expect(gen.smart).toHaveBeenCalledTimes(2);
    expect(gen.fast).toHaveBeenCalledTimes(2);
    expect(gen.fallback).toHaveBeenCalledTimes(1);
  });

  it("smart sends thinkingLevel 'low'", async () => {
    await expect(call('k7', 'smart')).resolves.toMatchObject({ model: 'smart-test' });
    const smartOpts = gen.smart.mock.calls[0][0];
    expect(smartOpts.providerOptions?.google?.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    await call('k7b');
    const fastOpts = gen.fast.mock.calls[0][0];
    expect(fastOpts.providerOptions?.google?.thinkingConfig).toBeUndefined();
  });

  it('paces each model by its own RPM', async () => {
    vi.stubEnv('GEMINI_RPM_SMART', '4');
    await call('k8a', 'smart');
    expect(sleep).not.toHaveBeenCalled();
    await call('k8b', 'smart');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThan(14_900);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(15_000);
    await call('k8c');
    expect(gen.fast).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1); // the fast call did not wait on the smart slot
  });

  it('skips only the model whose pacing slot falls after the deadline', async () => {
    vi.stubEnv('GEMINI_RPM_SMART', '4'); // SMART's next slot is 15 s after this call
    await call('k8d', 'smart');
    const r = await call('k8e', 'smart', 10_000); // 10 s deadline: SMART cannot start in time, FAST can
    expect(r).toMatchObject({ provider: 'gemini', model: 'fast-test' });
    expect(gen.smart).toHaveBeenCalledTimes(1);
  });

  it('budget guard skips a model at its RPD', async () => {
    usage.set(`${pacificDay(new Date())}|fast-test`, 450);
    const r = await call('k9');
    expect(gen.fast).not.toHaveBeenCalled();
    expect(r.model).toBe('fallback-test');
  });

  it('records usage via the atomic increment', async () => {
    const day = pacificDay(new Date());
    await call('k10a');
    expect(usageStore.add).toHaveBeenCalledTimes(1);
    expect(usageStore.add).toHaveBeenCalledWith(day, 'fast-test', { requests: 1, rateLimited: 0, tokensIn: 12, tokensOut: 4 });
    await expect(usageStore.add.mock.results[0].value).resolves.toBe(1);

    gen.fast.mockRejectedValueOnce(quota429());
    await call('k10b');
    expect(usageStore.add).toHaveBeenCalledWith(day, 'fast-test', expect.objectContaining({ requests: 1, rateLimited: 1 }));

    // When the increment reports the cap, the next call skips fast without reading the table again.
    usageStore.add.mockResolvedValueOnce(450);
    await call('k10c');
    usageStore.get.mockClear();
    gen.fast.mockClear();
    const r = await call('k10d');
    expect(gen.fast).not.toHaveBeenCalled();
    expect(usageStore.get).not.toHaveBeenCalledWith(day, 'fast-test');
    expect(r.model).toBe('fallback-test');
  });

  it('schema failure moves down without retry', async () => {
    gen.fast.mockResolvedValue(reply('{"wrong":1}'));
    gen.fallback.mockResolvedValue(reply('{"wrong":1}'));
    await expect(call('k11')).resolves.toEqual({ provider: 'fallback', model: null, cached: false, output: { answer: 'fb' } });
    expect(gen.fast).toHaveBeenCalledTimes(1);
    expect(gen.fallback).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('auth error moves down at once', async () => {
    gen.fast.mockRejectedValue(httpError(401));
    const r = await call('k12');
    expect(gen.fast).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(r.model).toBe('fallback-test');
  });

  it('5xx retries once after 2 s then moves down', async () => {
    gen.fast.mockRejectedValue(httpError(503));
    const r = await call('k13');
    expect(gen.fast).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(r.model).toBe('fallback-test');
  });

  it('timeout goes to fallback', async () => {
    for (const t of ['smart', 'fast', 'fallback'] as const) gen[t].mockImplementation(hang);
    const started = Date.now();
    const r = await call('k14', 'fast', 50);
    expect(r).toEqual({ provider: 'fallback', model: null, cached: false, output: { answer: 'fb' } });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(sleep).not.toHaveBeenCalledWith(2000);
  });

  it('missing key → fallback without calling the model', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(call('k15')).resolves.toEqual({ provider: 'fallback', model: null, cached: false, output: { answer: 'fb' } });
    for (const t of ['smart', 'fast', 'fallback'] as const) expect(gen[t]).not.toHaveBeenCalled();
    await expect(geminiStatus()).resolves.toBe('missing');
  });

  it('cache is checked for every ladder model', async () => {
    cache.set(cacheKeyFor('describe', 'fallback-test', 'k16'), { answer: 'cached' });
    await expect(call('k16')).resolves.toEqual({ output: { answer: 'cached' }, provider: 'gemini', model: 'fallback-test', cached: true });
    for (const t of ['smart', 'fast', 'fallback'] as const) expect(gen[t]).not.toHaveBeenCalled();
  });

  it('uses sha256(instructions + prompt) as the cache key when none is given', async () => {
    await callLLM('describe', input, schema, { fallback });
    await callLLM('describe', input, schema, { fallback });
    expect(gen.fast).toHaveBeenCalledTimes(1);
  });

  it('geminiStatus is ok', async () => {
    __resetLimiter();
    await expect(geminiStatus()).resolves.toBe('ok');
  });
});

describe('pacificDay', () => {
  it('uses the America/Los_Angeles date (RPD resets at 00:00 PT)', () => {
    expect(pacificDay(new Date('2026-10-17T06:59:00Z'))).toBe('2026-10-16');
    expect(pacificDay(new Date('2026-10-17T07:00:00Z'))).toBe('2026-10-17');
  });
});

describe('nextQuotaReset', () => {
  it('is the next 00:00 Pacific', () => {
    // 2026-10-17 05:00 PKT = 2026-10-17T00:00Z = 2026-10-16 17:00 PDT → next reset 2026-10-17T07:00Z
    expect(nextQuotaReset(Date.parse('2026-10-17T00:00:00Z'))).toBe(Date.parse('2026-10-17T07:00:00Z'));
  });
});
