import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFeed } from './http';

const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>';

afterEach(() => vi.unstubAllGlobals());

describe('fetchFeed retry (Al Jazeera TLS resets)', () => {
  it('retries once after a network error and succeeds', async () => {
    const fetchMock = vi
      .fn<(u: string, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('read ECONNRESET') }))
      .mockResolvedValueOnce(new Response(rss, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchFeed('https://www.aljazeera.com/xml/rss/all.xml', null, { retryDelayMs: 0 });
    expect(res.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second network error', async () => {
    const fetchMock = vi.fn<(u: string, init?: RequestInit) => Promise<Response>>().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchFeed('https://a.com/feed', null, { retryDelayMs: 0 });
    expect(res.status).toBe('error');
    expect(res.cache.error).toContain('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an HTTP error (a 403 bot wall is an answer)', async () => {
    const fetchMock = vi.fn<(u: string, init?: RequestInit) => Promise<Response>>(async () => new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchFeed('https://a.com/feed', null, { retryDelayMs: 0 });
    expect(res.status).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
