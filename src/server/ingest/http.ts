import { decodeFeedBody } from './decode';
import type { FeedCache } from './types';

export const USER_AGENT = 'Mozilla/5.0 (compatible; SubahBot/1.0; +https://github.com/munib123/personal-morning-paper)';
export const FEED_TIMEOUT_MS = 15_000;

const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';

export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    return `${err.name === 'Error' ? '' : `${err.name}: `}${err.message}${detail}`;
  }
  return String(err);
};

/** fetch with our User-Agent and a hard timeout (AbortSignal.timeout also covers reading the body). */
export function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);
  return fetch(url, { redirect: 'follow', ...init, headers, signal: AbortSignal.timeout(ms) });
}

/** A feed starts with "<" and has an rss, feed or rdf root somewhere (bot walls answer 200 with HTML). */
function feedProblem(body: string): string | null {
  const head = body.trimStart();
  if (!head) return 'empty body';
  if (head[0] !== '<' || !/<(?:rss|feed|rdf:rdf)[\s>]/i.test(head.slice(0, 5000))) return 'not a feed (html or bot wall)';
  return null;
}

/**
 * One feed fetch: 15 s timeout, decoded by charset. Non-2xx, an empty 2xx (Akamai 202) or a body
 * that is not RSS/Atom is an error with `cache.error` set; bot walls are recorded, never bypassed.
 */
export async function fetchFeed(
  url: string,
  cache: FeedCache | null,
): Promise<{ status: 'ok' | 'not_modified' | 'error'; body: string | null; cache: FeedCache }> {
  const base: FeedCache = {
    httpStatus: null,
    etag: cache?.etag ?? null,
    lastModified: cache?.lastModified ?? null,
    error: null,
    items: cache?.items ?? 0,
    at: new Date().toISOString(), // ops timestamp (real clock, not the demo clock)
  };
  const headers: Record<string, string> = { accept: FEED_ACCEPT };
  if (cache?.etag) headers['if-none-match'] = cache.etag; // conditional GET (§10.1)
  if (cache?.lastModified) headers['if-modified-since'] = cache.lastModified;
  try {
    const res = await fetchWithTimeout(url, { headers }, FEED_TIMEOUT_MS);
    const next: FeedCache = { ...base, httpStatus: res.status };
    if (res.status === 304) return { status: 'not_modified', body: null, cache: next };
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { status: 'error', body: null, cache: { ...next, error: `HTTP ${res.status}` } };
    }
    const body = decodeFeedBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type'));
    const problem = feedProblem(body);
    if (problem) return { status: 'error', body: null, cache: { ...next, error: problem } };
    return {
      status: 'ok',
      body,
      cache: { ...next, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') },
    };
  } catch (err) {
    return { status: 'error', body: null, cache: { ...base, error: errorMessage(err) } };
  }
}
