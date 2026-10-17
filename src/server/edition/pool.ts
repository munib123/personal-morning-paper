// Candidate rows → engine Candidates (ARCHITECTURE §9.1 engine.ts), and the shared candidate pool.
import type { Candidate } from '@/contracts/engine';
import type { TopicSlug } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector } from '@/server/db/vector';

/** The article columns (plus cluster and source joins) a Candidate needs. */
export const CANDIDATE_COLUMNS =
  'id, embedding, labels, cluster_id, published_at, source_id, word_count, image_url, headline, title, clusters(importance, source_count), sources(quality)';

export interface CandidateRow {
  id: string;
  embedding: string | null;
  labels: unknown;
  cluster_id: string | null;
  published_at: string;
  source_id: string;
  word_count: number | null;
  image_url: string | null;
  headline: string | null;
  title: string;
  clusters: { importance: number | null; source_count: number | null } | null;
  sources: { quality: number | null } | null;
}

/** articles.labels is jsonb [{ slug, conf }]; anything malformed is dropped. */
export function parseLabels(raw: unknown): { slug: TopicSlug; conf: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { slug: TopicSlug; conf: number }[] = [];
  for (const l of raw) {
    if (l && typeof l === 'object' && typeof (l as { slug?: unknown }).slug === 'string') {
      const conf = Number((l as { conf?: unknown }).conf);
      out.push({ slug: (l as { slug: string }).slug, conf: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0 });
    }
  }
  return out;
}

const HOUR_MS = 3_600_000;
const POOL_HOURS = 36;
const WIDE_HOURS = 7 * 24;
const MIN_POOL = 60;
const POOL_LIMIT = 1500;
const CACHE_MS = 10 * 60_000;

let cache: { at: number; pool: Candidate[] } | null = null;

async function queryPool(now: Date, hours: number): Promise<Candidate[]> {
  const since = new Date(now.getTime() - hours * HOUR_MS).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('articles')
    .select(CANDIDATE_COLUMNS)
    .in('status', ['enriched', 'fallback'])
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(POOL_LIMIT);
  if (error) throw new Error(`loadCandidatePool: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[]).map(rowToCandidate);
}

/**
 * Enriched or fallback articles of the last 36 h (7 d when that gives fewer than 60), newest first.
 * Cached per process; the cache is reused only while its `now` is within 10 minutes of the caller's,
 * so a demo-clock jump loads a fresh pool (§9.7).
 */
export async function loadCandidatePool(now: Date): Promise<Candidate[]> {
  if (cache && Math.abs(now.getTime() - cache.at) <= CACHE_MS) return cache.pool;
  let pool = await queryPool(now, POOL_HOURS);
  if (pool.length < MIN_POOL) pool = await queryPool(now, WIDE_HOURS);
  cache = { at: now.getTime(), pool };
  return pool;
}

export function rowToCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    embedding: parseVector(row.embedding),
    labels: parseLabels(row.labels),
    clusterId: row.cluster_id,
    importance: row.clusters?.importance ?? 0,
    sourceCount: row.clusters?.source_count ?? 1,
    publishedAt: row.published_at,
    sourceId: row.source_id,
    sourceQuality: row.sources?.quality ?? 0.5,
    wordCount: row.word_count ?? 0,
    hasImage: !!row.image_url,
    headline: row.headline ?? row.title,
  };
}
