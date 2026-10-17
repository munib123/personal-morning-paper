// Hacker News (keyless Firebase API, §10.1): top stories with score ≥ 50. Images and text come
// from the page phase (og:image, "title. og:description").
import pLimit from 'p-limit';
import { fetchWithTimeout } from '../http';
import type { RawItem } from '../types';

export const HN_MIN_SCORE = 50;
const HN_API = 'https://hacker-news.firebaseio.com/v0';
const HN_TIMEOUT_MS = 10_000;
const HN_ITEM_CONCURRENCY = 10;

interface HnItem {
  id: number;
  type?: string;
  by?: string;
  time?: number; // unix seconds
  title?: string;
  url?: string;
  score?: number;
  dead?: boolean;
  deleted?: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, HN_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/**
 * The top `max` stories (score ≥ 50) among the first 1.5 × max top-story ids. A story without a url
 * (Ask HN) links to its HN page. Throws when topstories itself fails; a failing item is skipped.
 */
export async function fetchHackerNews(max = 60, sourceId = 'hacker-news'): Promise<RawItem[]> {
  const ids = await getJson<unknown>(`${HN_API}/topstories.json`);
  const head = (Array.isArray(ids) ? ids : []).filter((id): id is number => Number.isInteger(id)).slice(0, Math.ceil(max * 1.5));
  const limit = pLimit(HN_ITEM_CONCURRENCY);
  const items = await Promise.all(
    head.map((id) =>
      limit(async () => {
        try {
          return await getJson<HnItem | null>(`${HN_API}/item/${id}.json`);
        } catch {
          return null;
        }
      }),
    ),
  );

  const out: RawItem[] = [];
  for (const it of items) {
    if (!it || it.dead || it.deleted || it.type !== 'story' || !it.title || (it.score ?? 0) < HN_MIN_SCORE) continue;
    out.push({
      sourceId,
      link: it.url ?? `https://news.ycombinator.com/item?id=${it.id}`,
      title: it.title,
      descriptionHtml: null,
      contentHtml: null,
      imageUrl: null,
      author: it.by ?? null,
      publishedRaw: it.time ?? null,
    });
    if (out.length >= max) break;
  }
  return out;
}
