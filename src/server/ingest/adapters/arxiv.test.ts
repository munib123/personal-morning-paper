import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARXIV_CATEGORIES, ARXIV_MIN_WINDOW_HOURS, fetchArxiv } from './arxiv';

const atom = readFileSync(new URL('../__fixtures__/arxiv.atom.xml', import.meta.url), 'utf8');
const queryUrl = (cat: string) => `https://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=10`;
const rateExceeded = () => new Response('Rate exceeded.', { status: 503 });
const ok = (body = atom) => new Response(body, { status: 200, headers: { 'content-type': 'application/atom+xml; charset=utf-8' } });
const empty = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: string | URL | Request) => (String(input).includes('cat:cs.AI') ? ok() : ok(empty)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchArxiv', () => {
  it('queries the newest 10 of each category, in order', async () => {
    await fetchArxiv(10, 0);
    expect(ARXIV_CATEGORIES).toEqual(['cs.AI', 'cs.LG', 'cs.CL', 'cs.SE']);
    expect(ARXIV_MIN_WINDOW_HOURS).toBe(96);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(ARXIV_CATEGORIES.map(queryUrl));
  });

  it('maps an entry: versionless https abs link, one-line title, abstract, first author, published date', async () => {
    const items = await fetchArxiv(10, 0);
    expect(items).toHaveLength(2);
    expect(items[0].sourceId).toBe('arxiv');
    expect(items[0].link).toBe('https://arxiv.org/abs/2610.01234');
    expect(items[0].title).toBe('Sparse Attention');
    expect(items[0].descriptionHtml).toMatch(/^We study sparse attention for long-context language models .* one million tokens\.$/);
    expect(items[0].author).toBe('Ada Lovelace');
    expect(items[0].imageUrl).toBeNull();
    expect(new Date(String(items[0].publishedRaw)).toISOString()).toBe('2026-10-15T17:59:59.000Z');
    expect(items[1].link).toBe('https://arxiv.org/abs/2610.05678');
  });

  it('lists a paper cross-listed in two categories once', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => (/cat:cs\.(AI|LG)/.test(String(input)) ? ok() : ok(empty)));
    const items = await fetchArxiv(10, 0);
    expect(items.map((i) => i.link)).toEqual(['https://arxiv.org/abs/2610.01234', 'https://arxiv.org/abs/2610.05678']);
  });

  it('retries a 503 "Rate exceeded" once, and skips a category that fails twice', async () => {
    let aiCalls = 0;
    let lgCalls = 0;
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('cat:cs.AI')) return ++aiCalls === 1 ? rateExceeded() : ok();
      if (url.includes('cat:cs.LG')) {
        lgCalls += 1;
        return rateExceeded();
      }
      return ok(empty);
    });
    const items = await fetchArxiv(10, 0);
    expect(aiCalls).toBe(2);
    expect(lgCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(items).toHaveLength(2);
  });

  it('throws when every category fails', async () => {
    fetchMock.mockImplementation(async () => rateExceeded());
    await expect(fetchArxiv(10, 0)).rejects.toThrow(/arxiv/i);
  });
});
