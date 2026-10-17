import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import pLimit from 'p-limit';
import { decodeFeedBody } from './decode';
import { fetchWithTimeout } from './http';
import { absoluteUrl, isGenericImage } from './images';
import { needsPage, prepareArticle } from './prepare';
import type { PageInfo, PreparedArticle } from './types';

export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_CONCURRENCY = 5;
export const PAGE_MAX_FETCHES = 400;
export const PAGE_BUDGET_MS = 150_000;

const PAGE_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';
const collapse = (t: string | null | undefined) => (t ? t.replace(/\s+/g, ' ').trim() : '');

/**
 * An article page → og:image / twitter:image (absolute, generic ones dropped), og:description (or
 * the meta description) and, only when `wantText`, the Readability text. Readability runs last
 * because it mutates the DOM.
 */
export function parseArticlePage(html: string, url: string, wantText: boolean): PageInfo {
  const { document } = parseHTML(html);
  const meta = (...selectors: string[]) => {
    for (const s of selectors) {
      const v = collapse(document.querySelector(s)?.getAttribute('content'));
      if (v) return v;
    }
    return null;
  };
  const image = (src: string | null) => {
    const abs = absoluteUrl(src, url);
    return abs && !isGenericImage(abs) ? abs : null;
  };

  const ogImage = image(meta('meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="og:image"]'));
  const twitterImage = image(meta('meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'meta[property="twitter:image"]'));
  const description = meta('meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]');

  let readableText: string | null = null;
  if (wantText) {
    try {
      readableText = collapse(new Readability(document as unknown as Document).parse()?.textContent) || null;
    } catch {
      readableText = null;
    }
  }
  return { ogImage, twitterImage, description, readableText };
}

/** GET an article page (10 s, HTML only) and parse it. Null on any failure: the draft stays as it was. */
export async function fetchArticlePage(url: string, wantText: boolean): Promise<PageInfo | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: { accept: PAGE_ACCEPT } }, PAGE_TIMEOUT_MS);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const html = decodeFeedBody(new Uint8Array(await res.arrayBuffer()), type);
    return parseArticlePage(html, res.url || url, wantText);
  } catch {
    return null;
  }
}

/**
 * The page phase (§10.1): for new drafts missing an image or enough text, fetch the article page
 * (image-first, `concurrency` at a time, at most `maxFetches`, no new fetch after `budgetMs`) and
 * re-run prepareArticle with it. Returns every draft, in order; a failed fetch leaves its draft as it was.
 */
export async function enrichFromPages(
  drafts: PreparedArticle[],
  now: Date,
  o: { concurrency?: number; maxFetches?: number; budgetMs?: number } = {},
): Promise<PreparedArticle[]> {
  const concurrency = o.concurrency ?? PAGE_CONCURRENCY;
  const maxFetches = o.maxFetches ?? PAGE_MAX_FETCHES;
  const budgetMs = o.budgetMs ?? PAGE_BUDGET_MS;
  const t0 = performance.now();

  const queue = drafts
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => needsPage(d))
    .sort((a, b) => Number(b.d.needsImage) - Number(a.d.needsImage) || Number(b.d.needsText) - Number(a.d.needsText))
    .slice(0, Math.max(0, maxFetches));

  const out = [...drafts];
  const limit = pLimit(Math.max(1, concurrency));
  await Promise.all(
    queue.map(({ d, index }) =>
      limit(async () => {
        if (performance.now() - t0 >= budgetMs) return;
        // The publisher's own link (utm and all) is the safest to fetch; the canonical URL is what we store.
        const page = await fetchArticlePage(d.raw.link || d.url, d.needsText);
        if (!page) return;
        out[index] = prepareArticle(d.raw, page, now) ?? d;
      }),
    ),
  );
  return out;
}
