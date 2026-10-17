// embedGemini with a mocked embedding model (no network): chunks, re-normalization and the 429 rule.
import { APICallError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setSleep } from '@/server/ai/limiter';

type DoEmbed = MockEmbeddingModelV4['doEmbed'];
const doEmbed = vi.fn<DoEmbed>();

vi.mock('@/server/ai/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/ai/models')>();
  return {
    ...actual,
    embeddingModel: () => new MockEmbeddingModelV4({ provider: 'google', modelId: 'embed-test', maxEmbeddingsPerCall: 100, doEmbed: (o) => doEmbed(o) }),
  };
});

const { embedGemini, embeddingModelId } = await import('./embed');

// Unnormalized 384-d vectors (norm 2) so the test can see the re-normalization.
const raw = (values: string[]) => ({ embeddings: values.map((_, i) => Array.from({ length: 384 }, (_, j) => (j === i % 384 ? 2 : 0))), warnings: [] });

function quota429() {
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
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '3s' },
        ],
      },
    }),
  });
}

const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test');
  vi.stubEnv('GEMINI_EMBED_MODEL', 'gemini-embedding-2');
  doEmbed.mockReset();
  doEmbed.mockImplementation(async ({ values }) => raw(values));
  sleep.mockClear();
  __setSleep(sleep);
});

afterEach(() => {
  __setSleep(null);
  vi.unstubAllEnvs();
});

describe('embedGemini', () => {
  it('embeds in chunks of 100 and re-normalizes to unit length', async () => {
    const out = await embedGemini(Array.from({ length: 150 }, (_, i) => `text ${i}`));
    expect(out).toHaveLength(150);
    expect(doEmbed).toHaveBeenCalledTimes(2);
    expect(Math.hypot(...out[0])).toBeCloseTo(1, 6);
    expect(embeddingModelId()).toBe('gemini:gemini-embedding-2');
  });

  it('waits the 429 retryDelay once, then succeeds', async () => {
    doEmbed.mockRejectedValueOnce(quota429());
    const out = await embedGemini(['a', 'b']);
    expect(out).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(doEmbed).toHaveBeenCalledTimes(2);
  });

  it('throws after a second 429', async () => {
    doEmbed.mockRejectedValue(quota429());
    await expect(embedGemini(['a'])).rejects.toThrow();
    expect(doEmbed).toHaveBeenCalledTimes(2);
  });
});
