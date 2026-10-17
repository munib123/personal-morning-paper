import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHackerNews, HN_MIN_SCORE } from './hn';

const TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';

let fetchMock: ReturnType<typeof vi.fn>;
let topIds: number[];
let items: Record<number, unknown>;

beforeEach(() => {
  topIds = [1, 2, 3, 4];
  items = {
    1: { id: 1, score: 120, url: 'https://x.com/a', time: 1760680800, by: 'pg', type: 'story', title: 'A' },
    2: { id: 2, score: 10, url: 'https://x.com/b', time: 1760680800, by: 'b', type: 'story', title: 'B' },
    3: { id: 3, score: 300, time: 1760680800, by: 'c', type: 'job', title: 'C is hiring' },
    4: { id: 4, score: 80, time: 1760684400, by: 'dang', type: 'story', title: 'Ask HN: D?' },
  };
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === TOP) return Response.json(topIds);
    const m = /\/item\/(\d+)\.json$/.exec(url);
    if (m) return Response.json(items[Number(m[1])] ?? { id: Number(m[1]), score: 100, type: 'story', title: `T${m[1]}`, time: 1760680800, by: 'x', url: `https://x.com/${m[1]}` });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchHackerNews', () => {
  it(`keeps stories with score >= ${HN_MIN_SCORE}, linking to HN when a story has no url`, async () => {
    const out = await fetchHackerNews();
    expect(HN_MIN_SCORE).toBe(50);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      sourceId: 'hacker-news',
      link: 'https://x.com/a',
      title: 'A',
      descriptionHtml: null,
      contentHtml: null,
      imageUrl: null,
      author: 'pg',
      publishedRaw: 1760680800,
    });
    expect(out[1].link).toBe('https://news.ycombinator.com/item?id=4');
    expect(out[1].title).toBe('Ask HN: D?');
  });

  it('reads only the first 90 ids and returns at most 60 items', async () => {
    topIds = Array.from({ length: 200 }, (_, i) => 1000 + i);
    const out = await fetchHackerNews(60);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(91);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.length).toBeGreaterThan(0);
  });

  it('skips items that fail to load and dead items', async () => {
    items[2] = { id: 2, score: 500, dead: true, url: 'https://x.com/b', time: 1760680800, by: 'b', type: 'story', title: 'B' };
    fetchMock.mockImplementationOnce(async () => Response.json(topIds)); // topstories
    fetchMock.mockImplementationOnce(async () => new Response('boom', { status: 500 })); // item 1
    const out = await fetchHackerNews();
    expect(out.map((i) => i.link)).toEqual(['https://news.ycombinator.com/item?id=4']);
  });

  it('throws when topstories fails (the source is then marked failed)', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('down', { status: 503 }));
    await expect(fetchHackerNews()).rejects.toThrow('503');
  });
});
