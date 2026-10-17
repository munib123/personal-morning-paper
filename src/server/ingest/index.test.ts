import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestSource, PreparedArticle } from './types';

const NOW = new Date('2026-10-17T06:00:00Z');

vi.mock('@/server/time', () => ({ requestNow: async () => new Date(NOW) }));
vi.mock('./store', () => ({
  loadSources: vi.fn(),
  ensureApiSources: vi.fn(async () => {}),
  findExistingHashes: vi.fn(async () => new Set<string>()),
  insertArticles: vi.fn(async (rows: PreparedArticle[]) => ({ inserted: rows.length, errors: [] })),
  recordSourceHealth: vi.fn(async () => {}),
  startJobRun: vi.fn(async () => 1),
  finishJobRun: vi.fn(async () => {}),
  updateArticleImages: vi.fn(async () => 0),
  listImageless: vi.fn(async () => []),
}));

import { urlHash } from './canonical';
import { runIngest } from './index';
import * as store from './store';

const HOUR = 3_600_000;
const pubDate = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toUTCString();
const longText = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');

interface FeedEntry {
  link: string;
  title: string;
  hoursAgo: number;
}
// Full items (image + 120-word content:encoded) need no page fetch; thin ones (no image, short text) do.
const rss = (items: FeedEntry[], { thin = false } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><description>A short description.</description>${
          thin
            ? ''
            : `<content:encoded><![CDATA[<p>${longText}</p>]]></content:encoded><media:content url="https://i.example.com/${encodeURIComponent(i.title)}.jpg" medium="image"/>`
        }<pubDate>${pubDate(i.hoursAgo)}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

const src = (id: string, url: string): IngestSource => ({ id, name: id, url, kind: 'rss', homepage: null, cache: null, failCount: 0 });

const DAWN_HOME = 'https://www.dawn.com/feeds/home';
const DAWN_LATEST = 'https://www.dawn.com/feeds/latest-news';
const TRIBUNE = 'https://tribune.com.pk/feed/home';
const STORY_1 = 'https://www.dawn.com/news/1';

type Served = string | { status: number; body: string; type?: string } | Error;
let served: Record<string, Served>;
let fetchMock: ReturnType<typeof vi.fn>;

function serve(map: Record<string, Served>) {
  served = map;
}

function useSources(list: IngestSource[]) {
  vi.mocked(store.loadSources).mockImplementation(async (ids?: string[]) => (ids ? list.filter((s) => ids.includes(s.id)) : list));
}

const insertedRows = (): PreparedArticle[] => vi.mocked(store.insertArticles).mock.calls.flatMap((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const hit = served[url];
    if (hit === undefined) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    if (hit instanceof Error) throw hit;
    if (typeof hit === 'string') return new Response(hit, { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
    return new Response(hit.body, { status: hit.status, headers: { 'content-type': hit.type ?? 'text/html' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  serve({
    [DAWN_HOME]: rss([
      { link: `${STORY_1}?utm_source=rss&amp;utm_medium=feed`, title: 'One', hoursAgo: 2 },
      { link: 'https://www.dawn.com/news/2', title: 'Two', hoursAgo: 3 },
      { link: 'https://www.dawn.com/news/old', title: 'Old', hoursAgo: 72 },
    ]),
    [DAWN_LATEST]: rss([
      { link: STORY_1, title: 'One', hoursAgo: 2 },
      { link: 'https://www.dawn.com/news/3', title: 'Three', hoursAgo: 1 },
    ]),
    [TRIBUNE]: rss([{ link: 'https://tribune.com.pk/story/9', title: 'Nine', hoursAgo: 5 }]),
  });
  useSources([src('dawn-home', DAWN_HOME), src('dawn-latest', DAWN_LATEST), src('tribune', TRIBUNE)]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runIngest', () => {
  it('dedupes the same story across feeds', async () => {
    await runIngest();
    const rows = insertedRows().filter((r) => r.urlHash === urlHash(STORY_1));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(STORY_1);
  });

  it('skips hashes already in the DB', async () => {
    vi.mocked(store.findExistingHashes).mockResolvedValueOnce(new Set([urlHash(STORY_1)]));
    const stats = await runIngest();
    expect(insertedRows().map((r) => r.url)).not.toContain(STORY_1);
    expect(stats.inserted).toBe(3);
  });

  it('html body marks source failed', async () => {
    serve({ ...served, 'https://bad.example/feed': { status: 200, body: '<html>Access denied</html>' } });
    useSources([src('dawn-home', DAWN_HOME), src('bad', 'https://bad.example/feed')]);
    const stats = await runIngest();
    expect(stats.failedSources).toEqual(['bad']);
    expect(insertedRows().length).toBeGreaterThan(0);
    const badHealth = vi.mocked(store.recordSourceHealth).mock.calls.find((c) => c[0].id === 'bad');
    expect(badHealth?.[1].ok).toBe(false);
    expect(badHealth?.[1].cache.error).toBeTruthy();
  });

  it('rejected fetch marks source failed', async () => {
    serve({ ...served, 'https://www.aljazeera.com/xml/rss/all.xml': new DOMException('aborted', 'AbortError') });
    useSources([src('al-jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'), src('dawn-home', DAWN_HOME)]);
    const stats = await runIngest();
    expect(stats.failedSources).toEqual(['al-jazeera']);
    expect(insertedRows().map((r) => r.sourceId)).toContain('dawn-home');
  });

  it('a bot wall answering 403 or an empty 202 marks the source failed', async () => {
    serve({ ...served, 'https://espn.example/rss': { status: 403, body: 'Forbidden' }, 'https://akamai.example/rss': { status: 202, body: '' } });
    useSources([src('espn', 'https://espn.example/rss'), src('akamai', 'https://akamai.example/rss'), src('tribune', TRIBUNE)]);
    const stats = await runIngest();
    expect(stats.failedSources.sort()).toEqual(['akamai', 'espn']);
    expect(stats.inserted).toBe(1);
  });

  it('stats add up', async () => {
    const stats = await runIngest();
    expect(stats.sources).toBe(3);
    expect(stats.fetched).toBe(6); // 3 + 2 + 1 parsed items
    expect(stats.skippedOld).toBe(1); // the 72 h old Dawn item
    expect(stats.inserted).toBe(4); // 5 kept, story 1 deduped
    expect(stats.failedSources).toEqual([]);
    expect(stats.ms).toBeGreaterThanOrEqual(0);
    expect(store.recordSourceHealth).toHaveBeenCalledTimes(3);
  });

  it('fetches the page of a story carried by two feeds once, and takes its og:image', async () => {
    const story = 'https://www.dawn.com/news/5';
    const page = { status: 200, type: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta property="og:image" content="https://i.dawn.com/5.jpg"></head><body><p>Short.</p></body></html>' };
    serve({
      [DAWN_HOME]: rss([{ link: `${story}?utm_source=rss`, title: 'Five', hoursAgo: 2 }], { thin: true }),
      [DAWN_LATEST]: rss([{ link: story, title: 'Five', hoursAgo: 2 }], { thin: true }),
      [story]: page,
      [`${story}?utm_source=rss`]: page, // the page phase fetches the publisher's own link
    });
    useSources([src('dawn-home', DAWN_HOME), src('dawn-latest', DAWN_LATEST)]);
    const stats = await runIngest();
    const pageCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith(story));
    expect(pageCalls).toHaveLength(1);
    expect(stats.inserted).toBe(1);
    expect(insertedRows()[0].imageUrl).toBe('https://i.dawn.com/5.jpg');
  });

  it('runs the Hacker News adapter for an hn source', async () => {
    const top = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const json = (v: unknown) => ({ status: 200, type: 'application/json', body: JSON.stringify(v) });
    const t = Math.floor(NOW.getTime() / 1000) - 3600;
    serve({
      [top]: json([1, 2]),
      'https://hacker-news.firebaseio.com/v0/item/1.json': json({ id: 1, type: 'story', score: 120, by: 'pg', time: t, title: 'Show HN: A', url: 'https://x.com/a' }),
      'https://hacker-news.firebaseio.com/v0/item/2.json': json({ id: 2, type: 'story', score: 5, by: 'b', time: t, title: 'Low', url: 'https://x.com/b' }),
      'https://x.com/a': { status: 200, type: 'text/html', body: '<!doctype html><html><head><meta property="og:description" content="A tiny database."><meta property="og:image" content="https://x.com/a.png"></head><body></body></html>' },
    });
    useSources([{ ...src('hacker-news', top), kind: 'hn' }]);
    const stats = await runIngest();
    expect(stats.fetched).toBe(1);
    expect(stats.failedSources).toEqual([]);
    expect(insertedRows()).toHaveLength(1);
    expect(insertedRows()[0]).toMatchObject({ sourceId: 'hacker-news', url: 'https://x.com/a', author: 'pg', imageUrl: 'https://x.com/a.png', contentText: 'Show HN: A. A tiny database.' });
  });

  it('runs the Dev.to adapter for a devto source', async () => {
    const api = 'https://dev.to/api/articles';
    const fresh = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    serve({
      [`${api}?top=1&tag=javascript&per_page=15`]: {
        status: 200,
        type: 'application/json',
        body: JSON.stringify([{ id: 1, title: 'Signals', description: longText, url: 'https://dev.to/a/signals', cover_image: 'https://media.dev.to/c.png', published_timestamp: fresh, user: { name: 'Ana' } }]),
      },
    });
    useSources([{ ...src('dev-to', api), kind: 'devto' }]);
    const stats = await runIngest();
    expect(stats.failedSources).toEqual([]);
    expect(insertedRows()).toHaveLength(1);
    expect(insertedRows()[0]).toMatchObject({ sourceId: 'dev-to', url: 'https://dev.to/a/signals', imageUrl: 'https://media.dev.to/c.png', author: 'Ana' });
  });

  it('respects maxPerSource and sourceIds', async () => {
    const stats = await runIngest({ sourceIds: ['dawn-home'], maxPerSource: 1 });
    expect(store.loadSources).toHaveBeenCalledWith(['dawn-home']);
    expect(insertedRows().length).toBeLessThanOrEqual(1);
    expect(stats.sources).toBe(1);
  });

  it('respects sinceHours', async () => {
    const stats = await runIngest({ sinceHours: 96 });
    expect(stats.skippedOld).toBe(0);
    expect(stats.inserted).toBe(5);
  });

  it('does not write job_runs', async () => {
    await runIngest();
    expect(store.startJobRun).not.toHaveBeenCalled();
    expect(store.finishJobRun).not.toHaveBeenCalled();
  });

  it('a failing health write does not stop the run', async () => {
    vi.mocked(store.recordSourceHealth).mockRejectedValueOnce(new Error('db hiccup'));
    const stats = await runIngest();
    expect(stats.inserted).toBe(4);
  });
});
