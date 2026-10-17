import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichFromPages, fetchArticlePage, parseArticlePage } from './page';
import { prepareArticle } from './prepare';
import { countWords } from './text';
import type { PreparedArticle, RawItem } from './types';

const html = readFileSync(new URL('./__fixtures__/article.html', import.meta.url), 'utf8');
const url = 'https://site.com/a';
const now = new Date('2026-10-17T06:00:00Z');
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

function draft(i: number, hasImage: boolean, nWords: number): PreparedArticle {
  const raw: RawItem = {
    sourceId: 's',
    link: `https://site.com/story/${i}`,
    title: `Story ${i}`,
    descriptionHtml: null,
    contentHtml: `<p>${words(nWords)}</p>`,
    imageUrl: hasImage ? `https://img.site.com/${i}.jpg` : null,
    author: null,
    publishedRaw: '2026-10-17T05:00:00Z',
  };
  return prepareArticle(raw, null, now)!;
}

const htmlResponse = (body = html) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('parseArticlePage', () => {
  it('reads og:image, twitter:image (made absolute), og:description and the Readability text', () => {
    const info = parseArticlePage(html, url, true);
    expect(info.ogImage).toBe('https://cdn.site.com/og.jpg');
    expect(info.twitterImage).toBe('https://cdn.site.com/tw.jpg');
    expect(info.description).toBe('A short og description.');
    expect(countWords(info.readableText!)).toBeGreaterThan(200);
    expect(info.readableText).not.toContain('Subscribe'); // nav chrome is gone
  });

  it('drops generic images', () => {
    expect(parseArticlePage(html.replace('og.jpg', 'social-default.jpg'), url, false).ogImage).toBeNull();
  });

  it('runs Readability only when the text is wanted', () => {
    expect(parseArticlePage(html, url, false).readableText).toBeNull();
  });

  it('falls back to meta description and resolves a relative og:image against the page url', () => {
    const page = '<!doctype html><html><head><meta name="description" content="Plain &amp; simple."><meta property="og:image" content="/img/lead.jpg"></head><body></body></html>';
    const info = parseArticlePage(page, 'https://site.com/news/a', false);
    expect(info.description).toBe('Plain & simple.');
    expect(info.ogImage).toBe('https://site.com/img/lead.jpg');
    expect(info.twitterImage).toBeNull();
  });
});

describe('fetchArticlePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for non-HTML and non-2xx responses, and for network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })));
    await expect(fetchArticlePage(url, false)).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403, headers: { 'content-type': 'text/html' } })));
    await expect(fetchArticlePage(url, false)).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(fetchArticlePage(url, false)).resolves.toBeNull();
  });

  it('sends our user agent and parses the page', async () => {
    const fetchMock = vi.fn<(u: string, init?: RequestInit) => Promise<Response>>(async () => htmlResponse());
    vi.stubGlobal('fetch', fetchMock);
    const info = await fetchArticlePage(url, true);
    expect(info?.ogImage).toBe('https://cdn.site.com/og.jpg');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('user-agent')).toContain('SubahBot/1.0');
  });
});

describe('enrichFromPages', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let inFlight = 0;
  let peak = 0;

  beforeEach(() => {
    inFlight = 0;
    peak = 0;
    fetchMock = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return htmlResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches only drafts missing an image or text, and re-prepares them with the page', async () => {
    const drafts = [draft(1, true, 300), draft(2, false, 300), draft(3, true, 30), draft(4, false, 30)];
    const out = await enrichFromPages(drafts, now);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out[0]).toBe(drafts[0]);
    expect(out[1].imageUrl).toBe('https://cdn.site.com/og.jpg');
    expect(out[1].wordCount).toBe(300);
    expect(out[2].imageUrl).toBe('https://img.site.com/3.jpg');
    expect(out[2].wordCount).toBeGreaterThan(200);
    expect(out[3].imageUrl).toBe('https://cdn.site.com/og.jpg');
    expect(out[3].wordCount).toBeGreaterThan(200);
  });

  it('keeps at most 5 page fetches in flight', async () => {
    const drafts = Array.from({ length: 20 }, (_, i) => draft(i, false, 30));
    await enrichFromPages(drafts, now);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it('stops at maxFetches, image-first', async () => {
    const drafts = [draft(1, true, 30), draft(2, false, 300), draft(3, false, 30)];
    const out = await enrichFromPages(drafts, now, { maxFetches: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out[0]).toBe(drafts[0]); // text-only draft lost the race to the two image drafts
    expect(out[1].imageUrl).toBe('https://cdn.site.com/og.jpg');
    expect(out[2].imageUrl).toBe('https://cdn.site.com/og.jpg');
  });

  it('schedules nothing once the time budget is spent', async () => {
    const drafts = [draft(1, false, 30), draft(2, false, 30)];
    const out = await enrichFromPages(drafts, now, { budgetMs: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toEqual(drafts);
  });

  it('skips hosts whose og:image is always the site logo (arXiv)', async () => {
    const paper = prepareArticle(
      { ...draft(1, false, 200).raw, link: 'https://arxiv.org/abs/2610.01234', contentHtml: null, descriptionHtml: words(200) },
      null,
      now,
    )!;
    const out = await enrichFromPages([paper], now);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toEqual([paper]);
  });

  it('a fetch that throws leaves that draft as it was', async () => {
    fetchMock.mockImplementationOnce(async () => Promise.reject(new DOMException('aborted', 'AbortError')));
    const drafts = [draft(1, false, 30), draft(2, false, 30)];
    const out = await enrichFromPages(drafts, now, { concurrency: 1 });
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(drafts[0]);
    expect(out[1].imageUrl).toBe('https://cdn.site.com/og.jpg');
  });
});
