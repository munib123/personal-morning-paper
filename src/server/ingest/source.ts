import { errorMessage, fetchFeed } from './http';
import { parseFeedXml } from './rss';
import type { FeedCache, IngestSource, SourceResult } from './types';
import { filterAndCap } from './window';

export interface SourceOptions {
  sinceHours: number;
  maxPerSource: number;
}

const emptyCache = (src: IngestSource, now: Date): FeedCache => ({
  httpStatus: null,
  etag: src.cache?.etag ?? null,
  lastModified: src.cache?.lastModified ?? null,
  error: null,
  items: 0,
  at: now.toISOString(),
});

/** A SourceResult for a source that failed before it produced any items. */
export function failedResult(src: IngestSource, now: Date, err: unknown): SourceResult {
  return { sourceId: src.id, items: [], fetched: 0, skippedOld: 0, ok: false, cache: { ...emptyCache(src, now), error: errorMessage(err) } };
}

async function processRss(src: IngestSource, now: Date, o: SourceOptions): Promise<SourceResult> {
  const res = await fetchFeed(src.url, src.cache);
  const base = { sourceId: src.id, items: [], fetched: 0, skippedOld: 0 };
  if (res.status === 'not_modified') return { ...base, ok: true, cache: res.cache };
  if (res.status === 'error' || res.body === null) return { ...base, ok: false, cache: res.cache };
  let items;
  try {
    items = await parseFeedXml(res.body, src.id, src.url);
  } catch (err) {
    return { ...base, ok: false, cache: { ...res.cache, error: `parse: ${errorMessage(err)}` } };
  }
  const { kept, skippedOld } = filterAndCap(items, now, o.sinceHours, o.maxPerSource);
  return { sourceId: src.id, items: kept, fetched: items.length, skippedOld, ok: true, cache: { ...res.cache, items: items.length } };
}

/** fetch → decode → parse → window/cap for one source, dispatched by kind. */
export async function processSource(src: IngestSource, now: Date, o: SourceOptions): Promise<SourceResult> {
  switch (src.kind) {
    case 'rss':
      return processRss(src, now, o);
    default:
      // API adapters land in Tasks 5-7.
      return { sourceId: src.id, items: [], fetched: 0, skippedOld: 0, ok: true, cache: emptyCache(src, now) };
  }
}
