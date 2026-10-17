// Candidate rows → engine Candidates (ARCHITECTURE §9.1 engine.ts), and the shared candidate pool.
import type { Candidate } from '@/contracts/engine';
import type { TopicSlug } from '@/contracts/taxonomy';
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
