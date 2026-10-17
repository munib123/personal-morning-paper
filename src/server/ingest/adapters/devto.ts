// Dev.to (Forem public API, keyless, §10.1): the day's top articles for five tags, with cover images.
import { errorMessage, fetchWithTimeout } from '../http';
import type { RawItem } from '../types';

export const DEVTO_TAGS = ['javascript', 'webdev', 'ai', 'devops', 'python'] as const;
const DEVTO_API = 'https://dev.to/api/articles';
const DEVTO_TIMEOUT_MS = 15_000;

interface DevtoArticle {
  id: number;
  title?: string;
  description?: string | null;
  url?: string;
  cover_image?: string | null;
  social_image?: string | null;
  published_timestamp?: string | null;
  user?: { name?: string | null } | null;
}

/**
 * `top=1` articles for each tag, one request at a time (Forem rate-limits bursts). An article under
 * two tags is listed once. A failing tag is skipped; when every tag fails, this throws.
 */
export async function fetchDevto(perTag = 15, sourceId = 'dev-to'): Promise<RawItem[]> {
  const seen = new Set<number>();
  const out: RawItem[] = [];
  const failures: string[] = [];
  for (const tag of DEVTO_TAGS) {
    let articles: DevtoArticle[];
    try {
      const res = await fetchWithTimeout(`${DEVTO_API}?top=1&tag=${tag}&per_page=${perTag}`, { headers: { accept: 'application/json' } }, DEVTO_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      articles = Array.isArray(body) ? (body as DevtoArticle[]) : [];
    } catch (err) {
      failures.push(`${tag}: ${errorMessage(err)}`);
      continue;
    }
    for (const a of articles) {
      if (!a?.url || !a.title || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({
        sourceId,
        link: a.url,
        title: a.title,
        descriptionHtml: a.description ?? null,
        contentHtml: null,
        imageUrl: a.cover_image ?? a.social_image ?? null,
        author: a.user?.name ?? null,
        publishedRaw: a.published_timestamp ?? null,
      });
    }
  }
  if (failures.length === DEVTO_TAGS.length) throw new Error(`dev.to: every tag failed (${failures.join('; ')})`);
  return out;
}
