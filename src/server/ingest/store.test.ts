import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedCache, IngestSource, PreparedArticle, SourceResult } from './types';

// A chainable fake of the Supabase query builder: every call is recorded, and awaiting a chain
// resolves to whatever `respond` returns for it.
interface Call {
  method: string;
  args: unknown[];
}
interface Chain {
  table: string;
  calls: Call[];
}
type Result = { data: unknown; error: { message: string } | null };

const chains: Chain[] = [];
let respond: (chain: Chain) => Result = () => ({ data: [], error: null });

function builder(chain: Chain): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(() => respond(chain)).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          chain.calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock('@/server/db/admin', () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const chain: Chain = { table, calls: [] };
      chains.push(chain);
      return builder(chain);
    },
  }),
}));

import {
  ensureApiSources,
  findExistingHashes,
  insertArticles,
  latestJobRun,
  listArticleStats,
  listImageless,
  loadSources,
  recordSourceHealth,
  updateArticleImages,
} from './store';

const has = (chain: Chain, method: string) => chain.calls.some((c) => c.method === method);
const argsOf = (chain: Chain, method: string) => chain.calls.find((c) => c.method === method)?.args;

const article = (i: number): PreparedArticle => ({
  sourceId: 'dawn-home',
  url: `https://www.dawn.com/news/${i}`,
  urlHash: `hash-${i}`,
  title: `Story ${i}`,
  lede: 'Lede.',
  contentText: 'Some text.',
  imageUrl: i % 2 ? 'https://i.dawn.com/a.jpg' : null,
  author: null,
  publishedAt: '2026-10-17T04:00:00.000Z',
  wordCount: 321,
  needsImage: false,
  needsText: false,
  raw: { sourceId: 'dawn-home', link: '', title: '', descriptionHtml: null, contentHtml: null, imageUrl: null, author: null, publishedRaw: null },
});

beforeEach(() => {
  chains.length = 0;
  respond = () => ({ data: [], error: null });
});

describe('insertArticles', () => {
  it('insertArticles continues after a failing chunk', async () => {
    let upserts = 0;
    respond = (chain) => {
      if (!has(chain, 'upsert')) return { data: [], error: null };
      upserts += 1;
      if (upserts === 2) return { data: null, error: { message: 'boom' } };
      const rows = argsOf(chain, 'upsert')![0] as { source_id: string }[];
      return { data: rows.map((r, i) => ({ id: `id-${i}`, source_id: r.source_id })), error: null };
    };
    const res = await insertArticles(Array.from({ length: 450 }, (_, i) => article(i)));
    expect(upserts).toBe(3); // chunks of 200: 200 + 200 + 50
    expect(res.inserted).toBe(250);
    expect(res.errors).toEqual(['boom']);
    expect(res.bySource).toEqual({ 'dawn-home': 250 });
  });

  it('maps rows to articles columns and ignores duplicates on url_hash', async () => {
    await insertArticles([article(1)]);
    const chain = chains.find((c) => has(c, 'upsert'))!;
    expect(chain.table).toBe('articles');
    const [rows, opts] = argsOf(chain, 'upsert') as [Record<string, unknown>[], Record<string, unknown>];
    expect(opts).toEqual({ onConflict: 'url_hash', ignoreDuplicates: true });
    expect(rows[0]).toEqual({
      source_id: 'dawn-home',
      url: 'https://www.dawn.com/news/1',
      url_hash: 'hash-1',
      title: 'Story 1',
      lede: 'Lede.',
      content_text: 'Some text.',
      image_url: 'https://i.dawn.com/a.jpg',
      author: null,
      published_at: '2026-10-17T04:00:00.000Z',
      word_count: 321,
      lang: 'en',
      status: 'raw',
    });
  });

  it('does nothing for an empty list', async () => {
    await expect(insertArticles([])).resolves.toEqual({ inserted: 0, errors: [], bySource: {} });
    expect(chains).toHaveLength(0);
  });
});

describe('findExistingHashes', () => {
  it('queries url_hash in chunks of 100 and returns the hits', async () => {
    respond = (chain) => {
      const [, values] = argsOf(chain, 'in') as [string, string[]];
      return { data: values.filter((v) => v.endsWith('7')).map((url_hash) => ({ url_hash })), error: null };
    };
    const hashes = Array.from({ length: 250 }, (_, i) => `h${i}`);
    const hits = await findExistingHashes(hashes);
    expect(chains).toHaveLength(3);
    expect(argsOf(chains[0], 'in')).toEqual(['url_hash', hashes.slice(0, 100)]);
    expect(hits.has('h7')).toBe(true);
    expect(hits.has('h8')).toBe(false);
    expect(hits.size).toBe(25);
  });

  it('throws when the query fails (the run must not insert blind)', async () => {
    respond = () => ({ data: null, error: { message: 'timeout' } });
    await expect(findExistingHashes(['a'])).rejects.toThrow('timeout');
  });
});

describe('loadSources', () => {
  it('loads active sources, optionally by id, and parses the last_status cache', async () => {
    const cache: FeedCache = { httpStatus: 200, etag: '"abc"', lastModified: null, error: null, items: 10, at: '2026-10-17T05:00:00.000Z' };
    respond = () => ({
      data: [
        { id: 'dawn-home', name: 'Dawn', url: 'https://www.dawn.com/feeds/home', kind: 'rss', homepage: 'https://www.dawn.com', last_status: JSON.stringify(cache), fail_count: 2 },
        { id: 'hacker-news', name: 'Hacker News', url: 'https://hacker-news.firebaseio.com/v0/topstories.json', kind: 'hn', homepage: null, last_status: 'not json', fail_count: 0 },
        { id: 'weird', name: 'Weird', url: 'https://w.example', kind: 'gopher', homepage: null, last_status: null, fail_count: 0 },
      ],
      error: null,
    });
    const sources = await loadSources(['dawn-home', 'hacker-news', 'weird']);
    const chain = chains[0];
    expect(chain.table).toBe('sources');
    expect(argsOf(chain, 'eq')).toEqual(['active', true]);
    expect(argsOf(chain, 'in')).toEqual(['id', ['dawn-home', 'hacker-news', 'weird']]);
    expect(sources.map((s) => s.id)).toEqual(['dawn-home', 'hacker-news']); // unknown kinds are skipped
    expect(sources[0]).toMatchObject({ kind: 'rss', cache, failCount: 2 });
    expect(sources[1].cache).toBeNull();
  });
});

describe('ensureApiSources', () => {
  const kinds = (...ks: string[]) => (chain: Chain): Result =>
    has(chain, 'upsert') ? { data: null, error: null } : { data: ks.map((kind) => ({ kind })), error: null };

  it('inserts nothing when every API kind has a row, active or not', async () => {
    respond = kinds('rss', 'hn', 'devto', 'arxiv'); // the seeded rows; one of them may be inactive
    await ensureApiSources();
    expect(chains.some((c) => has(c, 'upsert'))).toBe(false);
    expect(chains[0].table).toBe('sources');
    expect(has(chains[0], 'eq')).toBe(false); // inactive rows count as present
  });

  it('upserts only the missing kind, ignoring a url conflict', async () => {
    respond = kinds('rss', 'hn', 'arxiv');
    await ensureApiSources();
    const upserts = chains.filter((c) => has(c, 'upsert'));
    expect(upserts).toHaveLength(1);
    const [rows, opts] = argsOf(upserts[0], 'upsert') as [Record<string, unknown>[], Record<string, unknown>];
    expect(opts).toEqual({ onConflict: 'url', ignoreDuplicates: true });
    expect(rows).toEqual([
      {
        id: 'dev-to',
        name: 'DEV Community',
        kind: 'devto',
        url: 'https://dev.to/api/articles',
        homepage: 'https://dev.to',
        region: 'global',
        topics: ['technical.cs.web-dev', 'technical.cs.languages-tools'],
      },
    ]);
  });
});

describe('image backfill', () => {
  it('listImageless reads recent rows without an image, newest first', async () => {
    respond = () => ({ data: [{ url_hash: 'h1', url: 'https://a.com/1' }], error: null });
    const before = Date.now();
    const rows = await listImageless(48, 300);
    expect(rows).toEqual([{ urlHash: 'h1', url: 'https://a.com/1' }]);
    const chain = chains[0];
    expect(chain.table).toBe('articles');
    expect(argsOf(chain, 'is')).toEqual(['image_url', null]);
    const [col, cutoff] = argsOf(chain, 'gte') as [string, string];
    expect(col).toBe('published_at');
    expect(Math.abs(Date.parse(cutoff) - (before - 48 * 3_600_000))).toBeLessThan(60_000);
    expect(argsOf(chain, 'order')).toEqual(['published_at', { ascending: false }]);
    expect(argsOf(chain, 'limit')).toEqual([300]);
  });

  it('updateArticleImages sets image_url only where it is still null and counts the updated rows', async () => {
    respond = (chain) => {
      const [, hash] = argsOf(chain, 'eq') as [string, string];
      return { data: hash === 'gone' ? [] : [{ id: hash }], error: null };
    };
    const n = await updateArticleImages([
      { urlHash: 'h1', imageUrl: 'https://cdn/1.jpg' },
      { urlHash: 'gone', imageUrl: 'https://cdn/2.jpg' },
    ]);
    expect(n).toBe(1);
    expect(chains).toHaveLength(2);
    expect(argsOf(chains[0], 'update')).toEqual([{ image_url: 'https://cdn/1.jpg' }]);
    expect(argsOf(chains[0], 'is')).toEqual(['image_url', null]);
  });
});

describe('report reads', () => {
  it('listArticleStats pages through articles 1,000 rows at a time', async () => {
    const page = (n: number) => Array.from({ length: n }, () => ({ source_id: 's', image_url: null, fetched_at: '2026-10-17T05:00:00Z' }));
    respond = (chain) => {
      const [from] = argsOf(chain, 'range') as [number, number];
      return { data: from === 0 ? page(1000) : page(250), error: null };
    };
    const rows = await listArticleStats();
    expect(rows).toHaveLength(1250);
    expect(chains.map((c) => argsOf(c, 'range'))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(argsOf(chains[0], 'select')).toEqual(['source_id,image_url,fetched_at']);
  });

  it('latestJobRun returns the newest row of a job, or null', async () => {
    respond = () => ({ data: [{ id: 7, job: 'ingest-cron', status: 'ok' }], error: null });
    await expect(latestJobRun('ingest-cron')).resolves.toMatchObject({ id: 7, status: 'ok' });
    expect(argsOf(chains[0], 'eq')).toEqual(['job', 'ingest-cron']);
    expect(argsOf(chains[0], 'order')).toEqual(['id', { ascending: false }]);
    respond = () => ({ data: [], error: null });
    await expect(latestJobRun('ingest')).resolves.toBeNull();
  });
});

describe('recordSourceHealth', () => {
  it('writes last_fetched_at and last_status as JSON for the source', async () => {
    const source: IngestSource = { id: 'dawn-home', name: 'Dawn', url: 'u', kind: 'rss', homepage: null, cache: null, failCount: 0 };
    const cache: FeedCache = { httpStatus: 200, etag: null, lastModified: null, error: null, items: 3, at: '2026-10-17T06:00:00.000Z' };
    const result: SourceResult = { sourceId: 'dawn-home', items: [], fetched: 3, skippedOld: 0, ok: true, cache };
    await recordSourceHealth(source, result);
    const chain = chains[0];
    expect(chain.table).toBe('sources');
    expect(argsOf(chain, 'eq')).toEqual(['id', 'dawn-home']);
    const [patch] = argsOf(chain, 'update') as [Record<string, unknown>];
    expect(patch.last_fetched_at).toBe('2026-10-17T06:00:00.000Z');
    expect(JSON.parse(String(patch.last_status))).toEqual(cache);
    expect(patch.fail_count).toBe(0);
    expect(patch.active).toBe(true);
  });

  it('counts a failure and deactivates the source on the 5th in a row', async () => {
    const source: IngestSource = { id: 'espn', name: 'ESPN', url: 'u', kind: 'rss', homepage: null, cache: null, failCount: 4 };
    const cache: FeedCache = { httpStatus: 403, etag: null, lastModified: null, error: 'HTTP 403', items: 0, at: '2026-10-17T06:00:00.000Z' };
    await recordSourceHealth(source, { sourceId: 'espn', items: [], fetched: 0, skippedOld: 0, ok: false, cache });
    const [patch] = argsOf(chains[0], 'update') as [Record<string, unknown>];
    expect(patch.fail_count).toBe(5);
    expect(patch.active).toBe(false);
  });
});
