// arXiv (Atom API, keyless, §10.1). The arXiv RSS feeds are empty on weekends (<skipDays>), so the
// newest submissions per category come from the query API, throttled to one request every ~3 s.
import { errorMessage, fetchWithTimeout } from '../http';
import { parseFeedItems } from '../rss';
import type { RawItem } from '../types';

export const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.SE'] as const;
/** Weekend submissions lag, so arXiv items get at least a 96 h window. */
export const ARXIV_MIN_WINDOW_HOURS = 96;
const ARXIV_API = 'https://export.arxiv.org/api/query';
const ARXIV_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const collapse = (t: string | null | undefined) => (t ? t.replace(/\s+/g, ' ').trim() : '');

/** http://arxiv.org/abs/2610.01234v2 → https://arxiv.org/abs/2610.01234 (one row per paper, not per version). */
export function arxivAbsUrl(link: string): string | null {
  const m = /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/abs\/(.+?)(?:v\d+)?$/i.exec(link.trim());
  return m ? `https://arxiv.org/abs/${m[1]}` : null;
}

async function fetchCategory(cat: string, perCategory: number, gapMs: number): Promise<string> {
  const url = `${ARXIV_API}?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=${perCategory}`;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(gapMs); // "Rate exceeded": wait one gap and try once more
    try {
      const res = await fetchWithTimeout(url, { headers: { accept: 'application/atom+xml' } }, ARXIV_TIMEOUT_MS);
      if (res.ok) return await res.text();
      lastError = `HTTP ${res.status}`;
      await res.body?.cancel().catch(() => {});
    } catch (err) {
      lastError = errorMessage(err);
    }
  }
  throw new Error(lastError);
}

/**
 * The newest `perCategory` papers of cs.AI, cs.LG, cs.CL and cs.SE, `gapMs` apart. A paper
 * cross-listed in two categories is listed once. A category that fails twice is skipped; when
 * every category fails, this throws.
 */
export async function fetchArxiv(perCategory = 10, gapMs = 3100, sourceId = 'arxiv'): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  for (const [i, cat] of ARXIV_CATEGORIES.entries()) {
    if (i > 0) await sleep(gapMs);
    let entries;
    try {
      entries = await parseFeedItems(await fetchCategory(cat, perCategory, gapMs));
    } catch (err) {
      failures.push(`${cat}: ${errorMessage(err)}`);
      continue;
    }
    for (const e of entries) {
      const link = arxivAbsUrl(e.link ?? e.guid ?? '');
      const title = collapse(e.title);
      if (!link || !title || seen.has(link)) continue;
      seen.add(link);
      out.push({
        sourceId,
        link,
        title,
        descriptionHtml: collapse(e.summary ?? e.contentSnippet) || null,
        contentHtml: null,
        imageUrl: null,
        author: collapse(e.author ?? e.creator) || null,
        publishedRaw: e.isoDate ?? e.pubDate ?? null,
      });
    }
  }
  if (failures.length === ARXIV_CATEGORIES.length) throw new Error(`arxiv: every category failed (${failures.join('; ')})`);
  return out;
}
