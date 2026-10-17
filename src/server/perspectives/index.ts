// W2 "Other angles": the DB half. getClusterSources reads a cluster and its articles; computePerspectives
// runs Gemini through callLLM (FAST only, deterministic fallback) and stores the answer in
// clusters.perspectives; readPerspectives returns what is stored and never calls Gemini. Only the
// precompute script and jobs call computePerspectives: the request path reads or falls back.
import { callLLM } from '@/server/ai';
import type { Json } from '@/contracts/database.types';
import { createSupabaseAdminClient } from '@/server/db/admin';
import {
  acceptPerspectives,
  buildPerspectivesPrompt,
  fallbackPerspectives,
  PerspectivesSchema,
  StoredPerspectivesSchema,
  type ClusterArticle,
  type ClusterInfo,
  type StoredPerspectives,
} from './build';

export type { ClusterArticle, ClusterInfo, Perspectives, PerspectivesResponse, PerspectiveSource, StoredPerspectives } from './build';

export interface ClusterSources {
  cluster: ClusterInfo;
  articles: ClusterArticle[];
  stored: StoredPerspectives | null;
}

export interface ComputeResult extends StoredPerspectives {
  /** callLLM answered from llm_cache (no request made). */
  cached: boolean;
  /** A Gemini answer was already stored and `force` was not set, so nothing was computed. */
  skipped: boolean;
}

const ARTICLE_COLUMNS = 'id, source_id, title, headline, url, summary_brief, summary_std, lede, published_at, sources(name)';
const MAX_ARTICLES = 40;
const TIMEOUT_MS = 45_000;

export function parseStoredPerspectives(raw: unknown): StoredPerspectives | null {
  const parsed = StoredPerspectivesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The cluster, its articles (newest first) and whatever is stored; null when the cluster does not exist. */
export async function getClusterSources(clusterId: string): Promise<ClusterSources | null> {
  const db = createSupabaseAdminClient();
  const { data: cluster, error } = await db.from('clusters').select('id, headline, source_count, importance, perspectives').eq('id', clusterId).maybeSingle();
  if (error) throw new Error(`clusters read failed: ${error.message}`);
  if (!cluster) return null;
  const { data: rows, error: e2 } = await db
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('cluster_id', clusterId)
    .order('published_at', { ascending: false })
    .limit(MAX_ARTICLES);
  if (e2) throw new Error(`articles read failed: ${e2.message}`);
  const articles: ClusterArticle[] = (rows ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.sources?.name ?? r.source_id,
    title: r.title,
    headline: r.headline,
    url: r.url,
    summary: r.summary_std ?? r.summary_brief ?? r.lede,
    publishedAt: new Date(r.published_at).toISOString(),
  }));
  return {
    cluster: { id: cluster.id, headline: cluster.headline, sourceCount: cluster.source_count, importance: cluster.importance },
    articles,
    stored: parseStoredPerspectives(cluster.perspectives),
  };
}

/** The stored perspectives, or null. Never calls Gemini. */
export async function readPerspectives(clusterId: string): Promise<StoredPerspectives | null> {
  const { data, error } = await createSupabaseAdminClient().from('clusters').select('perspectives').eq('id', clusterId).maybeSingle();
  if (error || !data) return null;
  return parseStoredPerspectives(data.perspectives);
}

/**
 * Writes clusters.perspectives for one cluster. A stored Gemini answer is kept unless `force`;
 * a stored fallback is always retried. `offline` stores the deterministic fallback without a request
 * (the script uses it once its request budget is spent). `now` comes from the caller (jobs pass the clock).
 */
export async function computePerspectives(
  clusterId: string,
  opts: { now: Date; force?: boolean; offline?: boolean; timeoutMs?: number },
): Promise<ComputeResult | null> {
  const found = await getClusterSources(clusterId);
  if (!found) return null;
  const { cluster, articles, stored } = found;
  if (stored && stored.provider === 'gemini' && !opts.force) return { ...stored, cached: true, skipped: true };

  const fallback = () => fallbackPerspectives(cluster, articles);
  let value: StoredPerspectives;
  let cached = false;
  if (opts.offline) {
    value = { ...fallback(), provider: 'fallback', model: null, computedAt: opts.now.toISOString() };
  } else {
    const result = await callLLM('perspectives', buildPerspectivesPrompt(cluster, articles), PerspectivesSchema, {
      fallback,
      model: 'fast',
      timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
    });
    const accepted = acceptPerspectives(result.output, fallback);
    const provider = accepted === result.output ? result.provider : 'fallback';
    cached = result.cached;
    value = { ...accepted, provider, model: provider === 'gemini' ? result.model : null, computedAt: opts.now.toISOString() };
  }

  const { error } = await createSupabaseAdminClient()
    .from('clusters')
    .update({ perspectives: value as unknown as Json })
    .eq('id', clusterId);
  if (error) throw new Error(`clusters update failed: ${error.message}`);
  return { ...value, cached, skipped: false };
}
