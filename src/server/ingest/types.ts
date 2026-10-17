// Internal types shared by the ingest modules (L1). The public contract is IngestStats/runIngest in ./index.

export type SourceKind = 'rss' | 'hn' | 'devto' | 'arxiv';

/** Conditional-GET cache and last outcome, stored as JSON in sources.last_status. */
export interface FeedCache {
  httpStatus: number | null;
  etag: string | null;
  lastModified: string | null;
  error: string | null;
  items: number;
  at: string;
}

export interface IngestSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  homepage: string | null;
  cache: FeedCache | null;
  failCount: number;
}

/** One item as a source adapter returns it, before canonicalization. */
export interface RawItem {
  sourceId: string;
  link: string;
  title: string;
  descriptionHtml: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedRaw: string | number | null;
}

/** What an article page adds: images and, when asked, the Readability text. */
export interface PageInfo {
  ogImage: string | null;
  twitterImage: string | null;
  description: string | null;
  readableText: string | null;
}

/** A row ready for `articles`, plus what the page phase still needs. */
export interface PreparedArticle {
  sourceId: string;
  url: string;
  urlHash: string;
  title: string;
  lede: string | null;
  contentText: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  wordCount: number;
  needsImage: boolean;
  needsText: boolean;
  raw: RawItem;
}

export interface SourceResult {
  sourceId: string;
  items: RawItem[];
  fetched: number;
  skippedOld: number;
  ok: boolean;
  cache: FeedCache;
}
