import Parser from 'rss-parser';
import { pickFeedImage } from './images';
import { htmlToText } from './text';
import type { RawItem } from './types';

export interface MediaAttrs {
  url?: string;
  medium?: string;
  type?: string;
  width?: string;
  height?: string;
}
/** xml2js shape of a media:* element: attributes under `$`. */
export interface MediaNode {
  $?: MediaAttrs;
}

/** An rss-parser item plus our custom fields (RSS 2.0, RSS 1.0 and Atom). */
export interface FeedItem {
  link?: string;
  guid?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  summary?: string;
  content?: string;
  contentSnippet?: string;
  enclosure?: { url?: string; type?: string; length?: number | string };
  'media:content'?: MediaNode[] | MediaNode;
  'media:thumbnail'?: MediaNode[] | MediaNode;
  'content:encoded'?: string;
  'dc:creator'?: string;
}

const parser = new Parser<Record<string, unknown>, FeedItem>({
  defaultRSS: 2, // some feeds omit <rss version>
  customFields: {
    item: [['media:content', 'media:content', { keepArray: true }], 'media:thumbnail', 'content:encoded', 'enclosure', 'dc:creator'],
  },
});

// An "&" that does not start an XML entity: the most common way a live feed breaks strict XML.
const BARE_AMP = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi;

/** Raw rss-parser items of an RSS/Atom document; a BOM or leading whitespace is fine. Rejects non-feeds. */
export async function parseFeedItems(xml: string): Promise<FeedItem[]> {
  const clean = xml.replace(/^﻿/, '').trimStart();
  try {
    return (await parser.parseString(clean)).items ?? [];
  } catch (err) {
    const fixed = clean.replace(BARE_AMP, '&amp;');
    if (fixed === clean) throw err;
    return (await parser.parseString(fixed)).items ?? [];
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function resolveLink(link: string, feedUrl: string): string {
  try {
    return new URL(link.trim(), feedUrl).href;
  } catch {
    return link.trim();
  }
}

/** Feed XML → RawItem[] (link resolved against the feed URL; title as plain text). */
export async function parseFeedXml(xml: string, sourceId: string, feedUrl: string): Promise<RawItem[]> {
  const items = await parseFeedItems(xml);
  return items.map((item) => {
    const guid = str(item.guid);
    const rawLink = str(item.link) ?? (guid && /^https?:\/\//i.test(guid.trim()) ? guid : null);
    const link = rawLink ? resolveLink(rawLink, feedUrl) : '';
    return {
      sourceId,
      link,
      title: htmlToText(str(item.title) ?? ''),
      descriptionHtml: str(item.content) ?? str(item.summary),
      contentHtml: str(item['content:encoded']),
      imageUrl: pickFeedImage(item, link || feedUrl),
      author: str(item.creator) ?? str(item['dc:creator']) ?? str(item.author),
      publishedRaw: str(item.isoDate) ?? str(item.pubDate),
    };
  });
}
