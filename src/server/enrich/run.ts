// runEnrich (ARCHITECTURE §9.3, §10.3): embedded → enriched | fallback | unusable. Worker only, never on
// Vercel, never writes job_runs (§9.7). Candidates are `embedded` rows plus `fallback` rows that were never
// attempted (enriched_at null), so extractive stock is upgraded on the next run.
import pLimit from 'p-limit';
import type { Database, Json } from '@/contracts/database.types';
import { getLlmCallCount } from '@/server/ai';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { chunk, selectPaged } from '@/server/nlp/paged';
import { loadTopics } from '@/server/nlp/topics';
import { requestNow } from '@/server/time';
import { enrichAll, toStoredRecall, type EnrichOutcome } from './batch';
import { extractiveUpdate } from './extractive';
import type { EnrichStats } from './index';
import type { EnrichmentItem } from './schema';
import { selectForEnrichment, type EnrichCandidate } from './select';

type Db = ReturnType<typeof createSupabaseAdminClient>;
type ArticleUpdate = Database['public']['Tables']['articles']['Update'];

export const CANDIDATE_COLUMNS =
  'id, url_hash, cluster_id, word_count, published_at, labels, title, lede, content_text, status, sources(name, quality), clusters(importance)';

export interface CandidateRow {
  id: string;
  url_hash: string;
  cluster_id: string | null;
  word_count: number;
  published_at: string;
  labels: Json;
  title: string;
  lede: string | null;
  content_text: string | null;
  status: string;
  sources: { name: string; quality: number } | null;
  clusters: { importance: number } | null;
}

function toCandidate(r: CandidateRow): EnrichCandidate {
  return {
    id: r.id,
    urlHash: r.url_hash,
    clusterId: r.cluster_id,
    sourceName: r.sources?.name ?? 'Unknown source',
    sourceQuality: r.sources?.quality ?? 0.5,
    wordCount: r.word_count,
    publishedAt: new Date(r.published_at),
    importance: r.clusters?.importance ?? 0,
    labels: Array.isArray(r.labels) ? (r.labels as { slug: string; conf: number }[]) : [],
    title: r.title,
    lede: r.lede,
    contentText: r.content_text,
  };
}

const LABEL_WEIGHTS = [0.6, 0.25, 0.15];

/** Gemini's valid topic_slugs replace the NLP labels: most specific first, conf [0.6, 0.25, 0.15] renormalized (§9.7). */
export function labelsFromSlugs(slugs: string[], levels: Map<string, number>): { slug: string; conf: number }[] | null {
  if (slugs.length === 0) return null;
  const ordered = [...slugs].sort((a, b) => (levels.get(b) ?? 0) - (levels.get(a) ?? 0));
  const weights = LABEL_WEIGHTS.slice(0, ordered.length);
  const total = weights.reduce((s, w) => s + w, 0);
  return ordered.map((slug, i) => ({ slug, conf: weights[i] / total }));
}

const isItem = (f: EnrichOutcome['fields']): f is EnrichmentItem => 'topic_slugs' in f;

/** Clusters whose story already has a Gemini-enriched article: their other members stay extractive. */
async function representedClusters(db: Db, clusterIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunk([...new Set(clusterIds)], 200)) {
    const rows = await selectPaged((from, to) =>
      db.from('articles').select('cluster_id').eq('status', 'enriched').in('cluster_id', ids).order('id').range(from, to),
    );
    for (const r of rows) if (r.cluster_id) out.add(r.cluster_id);
  }
  return out;
}

/** Select, enrich and persist the given candidate rows. Used by runEnrich and by cli.ts reset-sample. */
export async function enrichRows(rows: CandidateRow[], opts: { cap?: number; batchSize?: number } = {}): Promise<EnrichStats> {
  const started = Date.now();
  const before = getLlmCallCount();
  const now = await requestNow();
  const db = createSupabaseAdminClient();
  if (rows.length === 0) return { enriched: 0, fallback: 0, unusable: 0, llmCalls: 0, ms: Date.now() - started };

  const topics = await loadTopics();
  const slugs = topics.map((t) => t.slug);
  const levels = new Map(topics.map((t) => [t.slug, t.level as number]));

  const cands = rows.map(toCandidate);
  const represented = await representedClusters(db, cands.flatMap((c) => (c.clusterId ? [c.clusterId] : [])));
  const eligible = cands.filter((c) => !c.clusterId || !represented.has(c.clusterId));
  const { llm } = selectForEnrichment(eligible, topics, now, { cap: opts.cap });
  console.log(`[enrich] ${cands.length} candidates, ${cands.length - eligible.length} in already-enriched clusters, ${llm.length} to Gemini`);

  const outcomes = await enrichAll(llm, slugs, { batchSize: opts.batchSize });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const stats = { enriched: 0, fallback: 0, unusable: 0 };
  const limit = pLimit(10);
  const write = (id: string, patch: ArticleUpdate) =>
    limit(async () => {
      const { error } = await db.from('articles').update(patch).eq('id', id);
      if (error) throw new Error(`articles update ${id}: ${error.message}`);
    });
  const writes: Promise<void>[] = [];
  const at = now.toISOString();

  for (const o of outcomes) {
    const row = byId.get(o.id)!;
    if (o.kind === 'enriched' && isItem(o.fields)) {
      const f = o.fields;
      const labels = labelsFromSlugs(f.topic_slugs, levels);
      writes.push(
        write(o.id, {
          headline: f.headline.trim(),
          summary_brief: f.summary_brief.trim(),
          summary_std: f.summary_std.trim(),
          summary_deep: f.summary_deep.trim(),
          why_it_matters: f.why_it_matters.trim() || null,
          key_fact: f.key_fact.trim() || null,
          entities: f.entities,
          recall: toStoredRecall(f.recall),
          ...(labels ? { labels } : {}),
          status: 'enriched',
          enrich_provider: o.provider,
          enriched_at: at,
        }),
      );
      if (row.cluster_id) {
        const clusterId = row.cluster_id;
        writes.push(
          limit(async () => {
            const { error } = await db.from('clusters').update({ headline: f.headline.trim() }).eq('id', clusterId);
            if (error) console.warn(`[enrich] cluster headline ${clusterId}: ${error.message}`);
          }),
        );
      }
      stats.enriched++;
    } else if (o.kind === 'unusable') {
      writes.push(write(o.id, { status: 'unusable', enrich_provider: o.provider, enriched_at: at }));
      stats.unusable++;
    } else {
      writes.push(write(o.id, { ...extractiveUpdate(toCandidate(row)), enriched_at: o.attempted ? at : null }));
      stats.fallback++;
    }
  }

  // Everything not sent to Gemini: embedded rows become extractive stock; existing fallback rows stay as they are.
  const sent = new Set(llm.map((c) => c.id));
  for (const r of rows) {
    if (sent.has(r.id) || r.status !== 'embedded') continue;
    writes.push(write(r.id, { ...extractiveUpdate(toCandidate(r)), enriched_at: null }));
    stats.fallback++;
  }
  await Promise.all(writes);

  return { ...stats, llmCalls: getLlmCallCount() - before, ms: Date.now() - started };
}

export async function runEnrich(opts?: { limit?: number; batchSize?: number }): Promise<EnrichStats> {
  const db = createSupabaseAdminClient();
  const rows = await selectPaged<CandidateRow>((from, to) =>
    db
      .from('articles')
      .select(CANDIDATE_COLUMNS)
      .or('status.eq.embedded,and(status.eq.fallback,enriched_at.is.null)')
      .order('published_at', { ascending: false })
      .order('id')
      .range(from, to)
      .overrideTypes<CandidateRow[], { merge: false }>(),
  );
  return enrichRows(rows, { cap: opts?.limit, batchSize: opts?.batchSize });
}
