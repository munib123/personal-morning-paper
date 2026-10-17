import { describe, expect, it } from 'vitest';
import { urlHash } from './canonical';
import { needsPage, prepareArticle } from './prepare';
import { countWords } from './text';
import type { PageInfo, RawItem } from './types';

const now = new Date('2026-10-17T06:00:00Z');
const words = (n: number, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

const raw = (over: Partial<RawItem> = {}): RawItem => ({
  sourceId: 'dawn-home',
  link: 'https://www.dawn.com/news/1950001/?utm_source=rss',
  title: ' PM & army\n chief meet ', // adapters hand over plain text (rss.ts already ran htmlToText)
  descriptionHtml: '<p>The PM met the army chief.</p>',
  contentHtml: null,
  imageUrl: 'https://i.dawn.com/large/2026/10/a.jpg',
  author: ' Staff Reporter ',
  publishedRaw: '2026-10-17T04:00:00Z',
  ...over,
});

const page = (over: Partial<PageInfo> = {}): PageInfo => ({
  ogImage: null,
  twitterImage: null,
  description: null,
  readableText: null,
  ...over,
});

describe('prepareArticle', () => {
  it('builds the row fields: canonical url, hash, plain title, lede, author, ISO date', () => {
    const a = prepareArticle(raw(), null, now)!;
    expect(a.url).toBe('https://www.dawn.com/news/1950001');
    expect(a.urlHash).toBe(urlHash('https://www.dawn.com/news/1950001'));
    expect(a.title).toBe('PM & army chief meet');
    expect(a.lede).toBe('The PM met the army chief.');
    expect(a.author).toBe('Staff Reporter');
    expect(a.publishedAt).toBe('2026-10-17T04:00:00.000Z');
    expect(a.sourceId).toBe('dawn-home');
  });

  it('truncates a 2,000-word content:encoded to 1,500 words and keeps the full count', () => {
    const a = prepareArticle(raw({ contentHtml: `<p>${words(2000)}</p>` }), null, now)!;
    expect(countWords(a.contentText)).toBe(1500);
    expect(a.wordCount).toBe(2000);
    expect(a.needsText).toBe(false);
    expect(a.lede).toBe('The PM met the army chief.');
  });

  it('drops items without a usable link or title', () => {
    expect(prepareArticle(raw({ link: '' }), null, now)).toBeNull();
    expect(prepareArticle(raw({ link: 'javascript:void(0)' }), null, now)).toBeNull();
    expect(prepareArticle(raw({ title: '  ' }), null, now)).toBeNull();
  });

  it('uses the longer of content and description when both are short, and flags needsText', () => {
    const a = prepareArticle(raw({ contentHtml: '<p>short</p>', descriptionHtml: `<p>${words(40)}</p>` }), null, now)!;
    expect(a.wordCount).toBe(40);
    expect(a.needsText).toBe(true);
    expect(a.needsImage).toBe(false);
  });

  it('prefers the page Readability text when the feed text is short and the page text is longer', () => {
    const a = prepareArticle(raw({ contentHtml: `<p>${words(30)}</p>` }), page({ readableText: words(300, 'r') }), now)!;
    expect(a.wordCount).toBe(300);
    expect(a.contentText.startsWith('r0 r1')).toBe(true);
  });

  it('keeps content:encoded with at least 80 words even when the page text is longer', () => {
    const a = prepareArticle(raw({ contentHtml: `<p>${words(90)}</p>` }), page({ readableText: words(300, 'r') }), now)!;
    expect(a.wordCount).toBe(90);
  });

  it('falls back to the page og:image, then twitter:image, when the feed has none', () => {
    const noImg = raw({ imageUrl: null });
    expect(prepareArticle(noImg, null, now)!.needsImage).toBe(true);
    expect(prepareArticle(noImg, page({ ogImage: 'https://cdn.s.com/og.jpg', twitterImage: 'https://cdn.s.com/tw.jpg' }), now)!.imageUrl).toBe(
      'https://cdn.s.com/og.jpg',
    );
    expect(prepareArticle(noImg, page({ twitterImage: 'https://cdn.s.com/tw.jpg' }), now)!.imageUrl).toBe('https://cdn.s.com/tw.jpg');
    expect(prepareArticle(noImg, page({ ogImage: 'https://www.dawn.com/_img/social-default.jpg' }), now)!.imageUrl).toBeNull();
  });

  it('gives an item with no feed text (Hacker News) "title. og:description" as its text and lede', () => {
    const hn = raw({ sourceId: 'hacker-news', title: 'Show HN: a tiny database', descriptionHtml: null, contentHtml: null, imageUrl: null });
    const a = prepareArticle(hn, page({ description: 'A database in 500 lines of C.' }), now)!;
    expect(a.contentText).toBe('Show HN: a tiny database. A database in 500 lines of C.');
    expect(a.lede).toBe('A database in 500 lines of C.');
  });

  it('caps a very long description lede at 120 words', () => {
    const a = prepareArticle(raw({ descriptionHtml: `<p>${words(300)}</p>` }), null, now)!;
    expect(countWords(a.lede!)).toBeLessThanOrEqual(121);
    expect(a.lede!.endsWith('…')).toBe(true);
    expect(a.wordCount).toBe(300);
  });

  it('dates an undated item at now', () => {
    expect(prepareArticle(raw({ publishedRaw: null }), null, now)!.publishedAt).toBe(now.toISOString());
  });
});

describe('needsPage', () => {
  it('is true when the image or the text is missing', () => {
    expect(needsPage(prepareArticle(raw(), null, now)!)).toBe(true); // 6-word text
    expect(needsPage(prepareArticle(raw({ contentHtml: `<p>${words(100)}</p>` }), null, now)!)).toBe(false);
    expect(needsPage(prepareArticle(raw({ contentHtml: `<p>${words(100)}</p>`, imageUrl: null }), null, now)!)).toBe(true);
  });
});
