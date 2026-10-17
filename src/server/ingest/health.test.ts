import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextHealth } from './health';
import { fetchFeed } from './http';
import type { FeedCache } from './types';

describe('nextHealth', () => {
  it('deactivates a source on its 5th consecutive failure', () => {
    expect(nextHealth({ failCount: 4 }, false)).toEqual({ failCount: 5, active: false });
  });

  it('resets the count on success', () => {
    expect(nextHealth({ failCount: 3 }, true)).toEqual({ failCount: 0, active: true });
  });

  it('counts a first failure and stays active', () => {
    expect(nextHealth({ failCount: 0 }, false)).toEqual({ failCount: 1, active: true });
  });
});

describe('fetchFeed conditional GET', () => {
  const cache: FeedCache = { httpStatus: 200, etag: '"abc"', lastModified: 'Sat, 17 Oct 2026 05:00:00 GMT', error: null, items: 12, at: '2026-10-17T05:00:00.000Z' };
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>';
  let fetchMock: ReturnType<typeof vi.fn<(u: string, init?: RequestInit) => Promise<Response>>>;

  const stub = (res: () => Response) => {
    fetchMock = vi.fn<(u: string, init?: RequestInit) => Promise<Response>>(async () => res());
    vi.stubGlobal('fetch', fetchMock);
  };
  const sentHeaders = () => new Headers(fetchMock.mock.calls[0][1]?.headers);

  afterEach(() => vi.unstubAllGlobals());

  it('sends If-None-Match and If-Modified-Since from the cache', async () => {
    stub(() => new Response(rss, { status: 200 }));
    await fetchFeed('https://a.com/feed', cache);
    expect(sentHeaders().get('if-none-match')).toBe('"abc"');
    expect(sentHeaders().get('if-modified-since')).toBe('Sat, 17 Oct 2026 05:00:00 GMT');
  });

  it('sends no conditional headers without a cache', async () => {
    stub(() => new Response(rss, { status: 200 }));
    await fetchFeed('https://a.com/feed', null);
    expect(sentHeaders().has('if-none-match')).toBe(false);
    expect(sentHeaders().has('if-modified-since')).toBe(false);
  });

  it('304 → not_modified, keeping the cached validators', async () => {
    stub(() => new Response(null, { status: 304 }));
    const res = await fetchFeed('https://a.com/feed', cache);
    expect(res.status).toBe('not_modified');
    expect(res.cache.etag).toBe('"abc"');
    expect(res.cache.httpStatus).toBe(304);
    expect(res.cache.error).toBeNull();
  });

  it('200 stores the new ETag; 403 is an error with its status', async () => {
    stub(() => new Response(rss, { status: 200, headers: { etag: '"new"' } }));
    expect((await fetchFeed('https://a.com/feed', cache)).cache.etag).toBe('"new"');
    stub(() => new Response('Forbidden', { status: 403 }));
    const res = await fetchFeed('https://a.com/feed', cache);
    expect(res.status).toBe('error');
    expect(res.cache.httpStatus).toBe(403);
    expect(res.cache.error).toBe('HTTP 403');
  });
});
